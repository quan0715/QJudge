# Seccomp Profile for C++ Judge

## 概述
此 seccomp profile 用於限制 C++ 評測容器可使用的系統呼叫（syscalls），進一步提升安全性。

## 設計原則
- **預設拒絕**：除非明確允許，否則所有 syscall 都被拒絕（`SCMP_ACT_ERRNO`）
- **最小權限**：只允許 C++ 程式編譯和執行所需的基本 syscalls
- **多架構支援**：支援 x86_64, x86, x32

## 被阻擋的危險 Syscalls

以下危險的 syscalls 被**明確阻擋**（不在允許清單中）：

### 系統管理類
- `reboot` - 重啟系統
- `swapon`, `swapoff` - swap 管理
- `mount`, `umount`, `umount2` - 檔案系統掛載
- `pivot_root` - 改變根目錄
- `chroot` - 改變根目錄

### 核心與模組
- `init_module`, `finit_module` - 載入核心模組
- `delete_module` - 刪除核心模組
- `kexec_load`, `kexec_file_load` - 載入新核心

### 除錯與追蹤
- `ptrace` - 程式追蹤（可被用於逃逸）
- `process_vm_readv`, `process_vm_writev` - 跨程序記憶體存取

### 時間與系統設定
- `settimeofday`, `clock_settime` - 設定系統時間
- `sethostname`, `setdomainname` - 設定主機名稱

### 網路特權操作
- 大部分網路 syscalls 已透過 `network_disabled=True` 限制
- 保留基本 socket syscalls 是為了錯誤處理（會失敗但不會 crash）

### 特權管理
- `setuid`, `setgid` 等已包含在允許清單（容器內已降權）
- 但 `capset` 等被限制

## 允許的 Syscalls 類別

### 檔案操作
- `open`, `openat`, `close`
- `read`, `write`, `pread`, `pwrite`
- `lseek`, `fstat`, `stat`
- `mkdir`, `rmdir`, `unlink`

### 記憶體管理
- `brk`, `mmap`, `munmap`
- `mprotect`, `madvise`

### 程序管理
- `fork`, `vfork`, `clone`
- `execve`, `execveat`
- `exit`, `exit_group`
- `wait4`, `waitpid`

### 訊號處理
- `rt_sigaction`, `rt_sigprocmask`
- `rt_sigreturn`, `kill`

### 時間
- `clock_gettime`, `gettimeofday`
- `nanosleep`, `clock_nanosleep`

## 使用方式

### 在 Docker 中啟用
```python
container = client.containers.run(
    image,
    security_opt=[
        'no-new-privileges',
        'seccomp=/path/to/cpp.json'
    ]
)
```

### 測試 Seccomp
```python
# 應該失敗的程式（reboot）
code = '''
#include <sys/reboot.h>
int main() {
    reboot(0x1234567);
    return 0;
}
'''
# 預期：RE (Runtime Error)

# 應該成功的程式
code = '''
#include <iostream>
int main() {
    std::cout << "Hello" << std::endl;
    return 0;
}
'''
# 預期：AC
```

## 安全性效果

### ✅ 阻擋的攻擊向量
1. **系統重啟**：無法呼叫 reboot
2. **核心模組載入**：無法載入惡意核心模組
3. **程序追蹤**：無法 ptrace 其他程序
4. **時間修改**：無法修改系統時間
5. **檔案系統掛載**：無法掛載新的檔案系統

### ⚠️ 仍需配合其他安全措施
- **Capabilities 限制**：`cap_drop` 移除危險權限
- **資源限制**：`pids_limit`, `mem_limit`
- **網路隔離**：`network_disabled=True`
- **檔案系統隔離**：`tmpfs` + no host mounts

## 參考資料
- [Docker Seccomp Profiles](https://docs.docker.com/engine/security/seccomp/)
- [Linux Syscalls](https://man7.org/linux/man-pages/man2/syscalls.2.html)
- [Seccomp BPF](https://www.kernel.org/doc/html/latest/userspace-api/seccomp_filter.html)
