# -*- coding: utf-8 -*-
"""
端口占用关闭工具（Windows 桌面应用）

功能：
- 输入端口号，查询占用该端口的进程（netstat -ano）
- 勾选要关闭的进程，强制结束（taskkill /PID /F）
- 权限不足时，可一键以管理员身份重新启动（UAC 提权）

运行方式：
    python port_killer.py
或双击「启动端口工具.bat」（用 pythonw 运行，无黑窗口）
"""

import ctypes
import locale
import os
import subprocess
import sys
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, ttk

CREATE_NO_WINDOW = 0x08000000  # 运行子命令时不弹出黑窗口
CHECK_OFF = "☐"
CHECK_ON = "☑"


# ---------------------------------------------------------------- 核心逻辑

def _run(cmd):
    """运行系统命令，返回 (returncode, stdout, stderr)。"""
    enc = locale.getpreferredencoding(False) or "utf-8"
    try:
        proc = subprocess.run(cmd, capture_output=True, creationflags=CREATE_NO_WINDOW)
        return (
            proc.returncode,
            proc.stdout.decode(enc, errors="replace"),
            proc.stderr.decode(enc, errors="replace"),
        )
    except FileNotFoundError:
        return -1, "", "找不到命令: " + " ".join(cmd)
    except OSError as exc:
        return -1, "", "执行命令失败: {} ({})".format(" ".join(cmd), exc)


def validate_port(text):
    """校验端口号，合法返回 1~65535 的整数，否则返回 None。"""
    try:
        number = int(str(text).strip())
    except (TypeError, ValueError):
        return None
    if 1 <= number <= 65535:
        return number
    return None


def extract_port(addr):
    """从本地地址提取端口号，如 0.0.0.0:135 -> '135'，[::]:8080 -> '8080'。"""
    if not addr or ":" not in addr:
        return None
    return addr.rsplit(":", 1)[-1]


def parse_netstat_line(line):
    """
    解析一行 netstat -ano 输出。
    TCP:  Proto Local Foreign State PID
    UDP:  Proto Local Foreign PID
    返回 dict 或 None。
    """
    parts = line.split()
    if len(parts) < 3:
        return None
    proto = parts[0].upper()
    if proto not in ("TCP", "UDP"):
        return None

    local = parts[1]
    remote = parts[2] if len(parts) >= 3 else ""
    state = ""
    pid = ""

    if proto == "TCP":
        if len(parts) >= 5:          # Proto Local Foreign State PID
            state = parts[3]
            pid = parts[4]
        elif len(parts) == 4:
            pid = parts[3]
    else:                            # UDP: Proto Local Foreign PID
        if len(parts) >= 4:
            pid = parts[3]

    return {
        "proto": proto,
        "local_addr": local,
        "local_port": extract_port(local),
        "remote_addr": remote,
        "state": state,
        "pid": pid,
    }


def netstat_output():
    """获取 netstat -ano 的完整输出文本。"""
    _rc, out, _err = _run(["netstat", "-ano"])
    return out


def find_processes_on_port(port):
    """
    查找占用指定端口的进程。
    返回 (results, skipped)：
    - results: 可关闭的进程行列表（按 PID+协议+状态 去重）
    - skipped: 被忽略的行数（PID 为 0，如 TIME_WAIT 残留，不可关闭）
    """
    port_str = str(port)
    results = []
    seen = set()
    skipped = 0
    for line in netstat_output().splitlines():
        info = parse_netstat_line(line)
        if not info or info["local_port"] != port_str:
            continue
        key = (info["pid"], info["proto"], info["state"])
        if key in seen:
            continue
        seen.add(key)
        if info["pid"] in ("", "0"):
            skipped += 1
            continue
        results.append(info)
    return results, skipped


def parse_csv_line(line):
    """简单解析一行 CSV（兼容引号内逗号），返回字段列表。"""
    fields = []
    current = []
    in_quotes = False
    for ch in line:
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == "," and not in_quotes:
            fields.append("".join(current))
            current = []
        else:
            current.append(ch)
    fields.append("".join(current))
    return fields


def get_process_names():
    """通过 tasklist 获取 {pid: 进程名} 映射。"""
    _rc, out, _err = _run(["tasklist", "/FO", "CSV", "/NH"])
    names = {}
    for line in out.splitlines():
        fields = parse_csv_line(line)
        if len(fields) >= 2:
            name = fields[0].strip().strip('"')
            pid = fields[1].strip().strip('"')
            if pid.isdigit():
                names[pid] = name
    return names


def kill_process(pid):
    """强制结束指定 PID 的进程，返回 (是否成功, 提示信息)。"""
    rc, out, err = _run(["taskkill", "/PID", str(pid), "/F"])
    detail = (err or out or "").strip()
    if rc == 0:
        return True, "已结束 PID {}：{}".format(pid, detail or "成功")
    if "拒绝访问" in detail or "Access is denied" in detail or rc == 5:
        return False, "权限不足，无法结束 PID {}：{}".format(pid, detail)
    if rc == 128 or "not found" in detail.lower() or "没有找到" in detail:
        return False, "PID {} 已不存在：{}".format(pid, detail)
    return False, "结束 PID {} 失败（返回码 {}）：{}".format(pid, rc, detail)


def is_admin():
    """当前进程是否以管理员权限运行。"""
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def relaunch_as_admin():
    """以管理员身份重新启动本工具（触发 UAC 提示），返回是否已发起。"""
    try:
        script = os.path.abspath(sys.argv[0])
        result = ctypes.windll.shell32.ShellExecuteW(
            None, "runas", sys.executable, '"{}"'.format(script), None, 1
        )
        return result > 32
    except Exception:
        return False


# ---------------------------------------------------------------- 图形界面

class PortKillerApp:
    """端口占用关闭工具主窗口。"""

    def __init__(self, root):
        self.root = root
        self.last_port = None
        self.process_names = {}
        self.checked = {}  # Treeview 行 iid -> 是否勾选

        root.title("端口占用关闭工具")
        root.geometry("780x580")
        root.minsize(700, 500)

        self._build_menu()
        self._build_widgets()

        if is_admin():
            self.log("当前以管理员身份运行，可关闭需要系统权限的进程。")
        else:
            self.log("当前为普通权限；如需关闭系统级进程，可在「工具」菜单中选择「以管理员身份重启」。")

    # ---------------- 界面构建 ----------------

    def _build_menu(self):
        menubar = tk.Menu(self.root)
        tool_menu = tk.Menu(menubar, tearoff=0)
        tool_menu.add_command(label="以管理员身份重启", command=self.on_relaunch_admin)
        tool_menu.add_separator()
        tool_menu.add_command(label="退出", command=self.root.destroy)
        menubar.add_cascade(label="工具", menu=tool_menu)

        help_menu = tk.Menu(menubar, tearoff=0)
        help_menu.add_command(label="关于", command=self.show_about)
        menubar.add_cascade(label="帮助", menu=help_menu)
        self.root.config(menu=menubar)

    def _build_widgets(self):
        try:
            ttk.Style(self.root).theme_use("vista")
        except tk.TclError:
            pass

        top = ttk.Frame(self.root, padding=(10, 8))
        top.pack(fill=tk.X)
        ttk.Label(top, text="端口号：").pack(side=tk.LEFT)
        self.port_var = tk.StringVar()
        self.port_entry = ttk.Entry(top, textvariable=self.port_var, width=10)
        self.port_entry.pack(side=tk.LEFT, padx=(0, 6))
        self.port_entry.bind("<Return>", lambda _e: self.on_query())
        ttk.Button(top, text="查询", command=self.on_query).pack(side=tk.LEFT, padx=2)
        ttk.Button(top, text="清空结果", command=self.on_clear).pack(side=tk.LEFT, padx=2)

        table_frame = ttk.Frame(self.root, padding=(10, 0))
        table_frame.pack(fill=tk.BOTH, expand=True)

        columns = ("check", "pid", "name", "proto", "local", "state")
        self.tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="browse")
        headers = {
            "check": ("选择", 50, tk.CENTER),
            "pid": ("PID", 80, tk.CENTER),
            "name": ("进程名", 180, tk.W),
            "proto": ("协议", 70, tk.CENTER),
            "local": ("本地地址", 200, tk.W),
            "state": ("状态", 120, tk.W),
        }
        for col, (title, width, anchor) in headers.items():
            self.tree.heading(col, text=title)
            self.tree.column(col, width=width, anchor=anchor, stretch=(col in ("name", "local")))
        self.tree.tag_configure("odd", background="#f5f6f8")

        vsb = ttk.Scrollbar(table_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.bind("<Button-1>", self.on_tree_click)

        actions = ttk.Frame(self.root, padding=(10, 6))
        actions.pack(fill=tk.X)
        ttk.Button(actions, text="全选", command=lambda: self.set_all(True)).pack(side=tk.LEFT, padx=2)
        ttk.Button(actions, text="取消全选", command=lambda: self.set_all(False)).pack(side=tk.LEFT, padx=2)
        ttk.Button(actions, text="关闭选中进程", command=self.on_kill).pack(side=tk.LEFT, padx=8)
        self.selected_label = ttk.Label(actions, text="已选 0 个")
        self.selected_label.pack(side=tk.RIGHT)

        log_frame = ttk.LabelFrame(self.root, text="日志", padding=(6, 4))
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        self.log_text = tk.Text(log_frame, height=8, state=tk.DISABLED, wrap=tk.WORD,
                                font=("Microsoft YaHei UI", 9))
        log_vsb = ttk.Scrollbar(log_frame, orient=tk.VERTICAL, command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_vsb.set)
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_vsb.pack(side=tk.RIGHT, fill=tk.Y)

        self.port_entry.focus_set()

    # ---------------- 动作 ----------------

    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.configure(state=tk.NORMAL)
        self.log_text.insert(tk.END, "[{}] {}\n".format(timestamp, message))
        self.log_text.see(tk.END)
        self.log_text.configure(state=tk.DISABLED)

    def on_query(self):
        port = validate_port(self.port_var.get())
        if port is None:
            messagebox.showwarning("端口号无效", "请输入 1~65535 之间的端口号。", parent=self.root)
            return
        self.log("正在查询端口 {} 的占用情况……".format(port))
        try:
            self.process_names = get_process_names()
            results, skipped = find_processes_on_port(port)
        except Exception as exc:
            self.log("查询出错：{}".format(exc))
            return

        self.last_port = port
        self.checked.clear()
        for item in self.tree.get_children():
            self.tree.delete(item)

        if not results:
            self.log("端口 {} 当前没有被占用（无活动进程）。".format(port))
        else:
            self.log("端口 {} 共发现 {} 个可关闭进程：".format(port, len(results)))
        for index, info in enumerate(results):
            name = self.process_names.get(info["pid"], "未知")
            state = info["state"] or "—"
            iid = self.tree.insert(
                "", tk.END,
                values=(CHECK_OFF, info["pid"], name, info["proto"], info["local_addr"], state),
                tags=("odd",) if index % 2 else (),
            )
            self.checked[iid] = False
        if skipped:
            self.log("另有 {} 条已结束/残留连接（PID=0）无法关闭，可忽略。".format(skipped))
        self.update_selected_label()

    def on_clear(self):
        self.checked.clear()
        for item in self.tree.get_children():
            self.tree.delete(item)
        self.update_selected_label()
        self.log("已清空结果列表。")

    def on_tree_click(self, event):
        """点击表格第一列（选择列）切换勾选状态。"""
        if self.tree.identify("region", event.x, event.y) != "cell":
            return
        if self.tree.identify_column(event.x) != "#1":
            return
        item = self.tree.identify_row(event.y)
        if not item:
            return
        self.checked[item] = not self.checked.get(item, False)
        self.tree.set(item, "check", CHECK_ON if self.checked[item] else CHECK_OFF)
        self.update_selected_label()

    def set_all(self, value):
        for iid in self.checked:
            self.checked[iid] = value
            self.tree.set(iid, "check", CHECK_ON if value else CHECK_OFF)
        self.update_selected_label()

    def update_selected_label(self):
        count = sum(1 for v in self.checked.values() if v)
        self.selected_label.config(text="已选 {} 个".format(count))

    def on_kill(self):
        targets = [iid for iid, checked in self.checked.items() if checked]
        if not targets:
            messagebox.showinfo("提示", "请先在列表中勾选要关闭的进程。", parent=self.root)
            return
        if not messagebox.askyesno(
            "确认关闭",
            "确定要强制结束选中的 {} 个进程吗？\n未保存的数据可能丢失。".format(len(targets)),
            parent=self.root,
        ):
            return

        denied = False
        for iid in list(targets):
            pid = self.tree.set(iid, "pid")
            ok, msg = kill_process(pid)
            self.log(msg)
            if ok:
                self.tree.delete(iid)
                self.checked.pop(iid, None)
            elif "权限不足" in msg:
                denied = True
        self.update_selected_label()
        self.log("可再次点击「查询」确认端口是否已释放。")

        if denied and messagebox.askyesno(
            "需要管理员权限",
            "部分进程因权限不足未能关闭。\n是否以管理员身份重新启动本工具？",
            parent=self.root,
        ):
            self.on_relaunch_admin()

    def on_relaunch_admin(self):
        if is_admin():
            messagebox.showinfo("提示", "当前已是管理员权限。", parent=self.root)
            return
        if relaunch_as_admin():
            self.log("已请求以管理员身份重新启动，请在 UAC 弹窗中确认。")
        else:
            messagebox.showerror("失败", "无法以管理员身份启动，请手动右键以管理员身份运行。", parent=self.root)

    def show_about(self):
        messagebox.showinfo(
            "关于",
            "端口占用关闭工具 v1.0\n\n"
            "输入端口号查询占用进程，勾选后强制结束。\n"
            "底层使用 netstat / taskkill。\n\n"
            "注意：强制结束进程可能导致未保存数据丢失。",
            parent=self.root,
        )


def main():
    root = tk.Tk()
    PortKillerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
