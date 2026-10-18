"""
Builds one submission and runs all of its cases inside the judge container.

io_judge.py runs this file as root in a single ``docker exec``:

    python3 -I -S -c <this file> <config JSON>

stdin carries the source code and then every case input, each as
``<byte length>\\n<bytes>``, read only when needed.  stdout carries one record
for the build and then one per case, each a JSON header line followed by
``size`` output bytes.  Nothing runs after a failed build.
"""
import ctypes
import json
import os
import resource
import shutil
import signal
import sys
import time

BUILD_DIR = "/tmp/build"
RUN_DIR = "/tmp/run"
# The build belongs to the image's judge user; cases run as another uid, so a
# case cannot alter what later cases execute.
BUILD_UID = 1001
SANDBOX_UID = 1002
OUTPUT_LIMIT = 1024 * 1024
POLL_SECONDS = 0.01
PR_SET_CHILD_SUBREAPER = 36
CLOCK_TICKS = os.sysconf("SC_CLK_TCK")


def main():
    config = json.loads(sys.argv[1])
    stdin = sys.stdin.buffer
    # Orphaned case processes come back to us, so every case ends with none left.
    if ctypes.CDLL(None).prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        raise OSError("cannot become a child subreaper")
    signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGCHLD})
    os.umask(0o022)
    devnull = os.open(os.devnull, os.O_RDWR)
    if build(config, stdin, devnull):
        for _ in range(config["cases"]):
            run_case(config, stdin, devnull)


def build(config, stdin, devnull):
    os.mkdir(BUILD_DIR)
    source = os.path.join(BUILD_DIR, config["source"])
    fd = os.open(source, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    receive(stdin, fd)
    os.close(fd)
    for path in (BUILD_DIR, source):
        os.chown(path, BUILD_UID, BUILD_UID)
    if not config["compile"]:
        emit({"exit": 0, "timeout": False})
        return True
    output = os.memfd_create("compile")
    pid = spawn(config["compile"], (devnull, output, output), BUILD_DIR, uid=BUILD_UID)
    status, _, timed_out = supervise(pid, config["compile_seconds"])
    clean_up()
    code = exit_code(status)
    failed = code != 0 or timed_out
    emit({"exit": code, "timeout": timed_out}, output if failed else None)
    # Warnings would otherwise take the cases' memory for the whole run.
    os.close(output)
    return not failed


def run_case(config, stdin, devnull):
    reset(devnull)
    case_input = os.memfd_create("input")
    receive(stdin, case_input)
    os.lseek(case_input, 0, os.SEEK_SET)
    output = os.memfd_create("output")
    report, report_writer = os.pipe()
    # GNU time stays root and forks from a small process, so it reports the
    # program's own peak memory; sh merges stderr into the output only after
    # time's report pipe is out of the program's reach.
    argv = [
        "/usr/bin/time", "-q", "-f", "%M",
        "setpriv", f"--reuid={SANDBOX_UID}", f"--regid={SANDBOX_UID}", "--clear-groups",
        "/bin/sh", "-c", 'exec "$@" 2>&1', "sh", *config["run"],
    ]
    pid = spawn(
        argv, (case_input, output, report_writer), RUN_DIR,
        limits={resource.RLIMIT_FSIZE: OUTPUT_LIMIT + 1},
    )
    os.close(report_writer)
    os.close(case_input)
    time_limit = config["time_limit"]
    status, usage, exceeded = supervise(pid, config["wall_limit"] / 1000, time_limit)
    clean_up()
    cpu_ms = round((usage.ru_utime + usage.ru_stime) * 1000)
    memory = os.read(report, 4096).split()
    os.close(report)
    emit({
        "exit": exit_code(status),
        "time": cpu_ms,
        "memory": int(memory[-1]) if memory else 0,
        "tle": exceeded or cpu_ms > time_limit,
    }, output)
    os.close(output)


def receive(stdin, fd):
    remaining = int(stdin.readline())
    while remaining:
        chunk = stdin.read(min(remaining, 1 << 16))
        if not chunk:
            raise EOFError("judge input ended early")
        os.write(fd, chunk)
        remaining -= len(chunk)


def emit(header, output=None):
    size = os.fstat(output).st_size if output is not None else 0
    header.update(ole=size > OUTPUT_LIMIT, size=min(size, OUTPUT_LIMIT))
    os.write(1, json.dumps(header).encode() + b"\n")
    sent = 0
    while sent < header["size"]:
        sent += os.sendfile(1, output, sent, header["size"] - sent)


def spawn(argv, fds, cwd, uid=0, limits=None):
    env = dict(os.environ, HOME=cwd, LC_ALL="C")
    pid = os.fork()
    if pid:
        return pid
    try:
        # Python ignores SIGPIPE and SIGXFSZ; the program gets the defaults.
        signal.pthread_sigmask(signal.SIG_SETMASK, ())
        for signum in (signal.SIGPIPE, signal.SIGXFSZ):
            signal.signal(signum, signal.SIG_DFL)
        for target, fd in enumerate(fds):
            os.dup2(fd, target)
        for limit, value in (limits or {}).items():
            resource.setrlimit(limit, (value, value))
        os.chdir(cwd)
        if uid:
            os.setgroups([])
            os.setresgid(uid, uid, uid)
            os.setresuid(uid, uid, uid)
        os.execvpe(argv[0], argv, env)
    finally:
        os._exit(127)


def supervise(pid, wall_seconds, time_limit=None):
    """Wait for pid, killing what it runs once it passes a limit.

    With a time limit, pid is GNU time and the limit is on the CPU time of its
    child, the program; the wall-clock limit only catches sleeping programs.
    """
    deadline = time.monotonic() + wall_seconds
    exceeded = False
    while True:
        done, status, usage = os.wait4(pid, os.WNOHANG)
        if done:
            return status, usage, exceeded
        if not exceeded:
            target = pid if time_limit is None else program_of(pid)
            if time.monotonic() > deadline or (target != pid and cpu_ms_of(target) > time_limit):
                exceeded = True
                try:
                    os.kill(target, signal.SIGKILL)
                except ProcessLookupError:
                    pass
        signal.sigtimedwait({signal.SIGCHLD}, POLL_SECONDS)


def program_of(pid):
    with open(f"/proc/{pid}/task/{pid}/children") as children:
        child = children.read().split()
    return int(child[0]) if child else pid


def cpu_ms_of(pid):
    try:
        with open(f"/proc/{pid}/stat") as stat:
            # utime, stime, cutime, cstime follow the parenthesised name.
            fields = stat.read().rpartition(")")[2].split()
    except (FileNotFoundError, ProcessLookupError):
        return 0
    return sum(int(ticks) for ticks in fields[11:15]) * 1000 / CLOCK_TICKS


def clean_up():
    """Kill and reap everything but this process and PID 1."""
    try:
        os.kill(-1, signal.SIGKILL)
    except ProcessLookupError:
        pass
    while True:
        try:
            os.wait()
        except ChildProcessError:
            return


def reset(devnull):
    """Remove what the previous case left: System V IPC and every writable
    path except the build."""
    if any(has_ipc(kind) for kind in ("msg", "sem", "shm")):
        # Only its owner may remove System V IPC.
        pid = spawn(["ipcrm", "-a"], (devnull, devnull, devnull), "/", uid=SANDBOX_UID)
        supervise(pid, 10)
        clean_up()
    for parent in ("/tmp", "/dev/shm"):
        for entry in os.scandir(parent):
            if entry.path == BUILD_DIR:
                continue
            if entry.is_dir(follow_symlinks=False):
                shutil.rmtree(entry.path)
            else:
                os.unlink(entry.path)
    os.mkdir(RUN_DIR)
    os.chown(RUN_DIR, SANDBOX_UID, SANDBOX_UID)


def has_ipc(kind):
    with open(f"/proc/sysvipc/{kind}") as table:
        return len(table.readlines()) > 1


def exit_code(status):
    code = os.waitstatus_to_exitcode(status)
    return code if code >= 0 else 128 - code


if __name__ == "__main__":
    main()
