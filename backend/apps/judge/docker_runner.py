"""
Docker-based C++ code execution service
"""
import docker
import tempfile
import os
from typing import Dict, Any


class CppJudge:
    def __init__(self):
        # 增加 timeout 設置避免 UnixHTTPConnectionPool timeout
        self.client = docker.from_env(timeout=60)
        self.image = 'oj-judge:latest'
    
    def execute_cpp(
        self,
        code: str,
        input_data: str,
        expected_output: str,
        time_limit: int,  # ms
        memory_limit: int  # MB
    ) -> Dict[str, Any]:
        """執行 C++ 代碼並比對輸出"""
        
        # 將編譯和執行合併在一個容器調用中
        timeout_sec = time_limit / 1000.0 + 0.5
        
        # 構建完整的命令：寫入代碼 -> 編譯 -> 寫入輸入 -> 執行
        full_cmd = f'''cat > main.cpp << 'CODEEOF'
{code}
CODEEOF

# 編譯
g++ -O2 -std=c++20 -o main main.cpp 2>&1
COMPILE_EXIT=$?

if [ $COMPILE_EXIT -ne 0 ]; then
    exit $COMPILE_EXIT
fi

# 寫入輸入
cat > input.txt << 'INPUTEOF'
{input_data}
INPUTEOF

# 執行
timeout {timeout_sec}s ./main < input.txt 2>&1
'''
        
        try:
            result = self._run_in_container(
                full_cmd,
                time_limit / 1000.0 + 2,  # 給編譯和執行足夠時間
                memory_limit
            )
            
            # 檢查是否是編譯錯誤（在執行 timeout 之前就失敗了）
            if result['exit_code'] != 0 and result['exit_code'] != 124:
                # 檢查輸出中是否包含編譯錯誤訊息
                if 'error:' in result['output'].lower() or 'undefined reference' in result['output'].lower():
                    return {
                        'status': 'CE',
                        'output': '',
                        'error': result['output'][:1000],
                        'time': 0,
                        'memory': 0
                    }
            
            # 檢查執行結果
            if result['exit_code'] == 124:  # timeout exit code
                return {
                    'status': 'TLE',
                    'output': result['output'][:1000],
                    'error': f'Time Limit Exceeded (>{time_limit}ms)',
                    'time': time_limit,
                    'memory': result['memory']
                }
            
            if result['exit_code'] != 0:
                return {
                    'status': 'RE',
                    'output': result['output'][:1000],
                    'error': f'Runtime Error (exit code: {result["exit_code"]})',
                    'time': result['time'],
                    'memory': result['memory']
                }
            
            # 比對輸出
            actual = result['output'].strip()
            expected = expected_output.strip()
            
            if actual == expected:
                return {
                    'status': 'AC',
                    'output': actual[:1000],
                    'error': '',
                    'time': result['time'],
                    'memory': result['memory']
                }
            else:
                return {
                    'status': 'WA',
                    'output': actual[:1000],
                    'error': 'Wrong Answer',
                    'time': result['time'],
                    'memory': result['memory']
                }
        except Exception as e:
            return {
                'status': 'SE',
                'output': '',
                'error': f'System Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
    
    
    def _run_in_container(
        self, command: str, timeout: float, mem_limit: int
    ) -> Dict[str, Any]:
        """在容器中執行命令（不使用 volume 掛載）"""
        
        container = None
        try:
            container = self.client.containers.run(
                self.image,
                command=['/bin/bash', '-c', command],
                working_dir='/tmp',
                network_disabled=True,
                mem_limit=f"{mem_limit}m",
                memswap_limit=f"{mem_limit}m",
                cpu_period=100000,
                cpu_quota=100000,
                detach=True,
                remove=False
            )
            
            # 增加 timeout 參數，避免等待太久
            result = container.wait(timeout=int(timeout) + 5)
            output = container.logs().decode('utf-8', errors='ignore')
            
            # 簡化的時間和記憶體統計
            try:
                stats = container.stats(stream=False)
                memory_usage = stats.get('memory_stats', {}).get('usage', 0) // 1024  # KB
            except:
                memory_usage = 0
            
            return {
                'exit_code': result['StatusCode'],
                'output': output,
                'time': 100,  # 簡化實作，實際應從 stats 計算
                'memory': memory_usage
            }
            
        except docker.errors.ContainerError as e:
            return {
                'exit_code': -1,
                'output': str(e),
                'time': 0,
                'memory': 0
            }
        except docker.errors.APIError as e:
            # Docker API 錯誤（包括 timeout）
            return {
                'exit_code': -1,
                'output': f'Docker API Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
        except Exception as e:
            return {
                'exit_code': -1,
                'output': f'System Error: {str(e)}',
                'time': 0,
                'memory': 0
            }
        finally:
            if container:
                try:
                    container.remove(force=True)
                except:
                    pass

