### 模型部署
`CUDA_VISIBLE_DEVICES=0 vllm serve Qwen/Qwen3-1.7B   --port 8888   --host 0.0.0.0   --gpu-memory-utilization 0.85   --max-model-len 4096   --served-model-name qwen1.7b`

#### Ollama部署
 - windows直接安装修改非C盘安装位置`OllamaSetup.exe /DIR="D:\AI_Tools\Ollama"`
 - `netstat -ano | findstr :11434`查看ollama端口占用
 - `taskkill /f /pid  5420`杀掉ollama安装后自动启动的进程
 - `Ollama serve`启动Ollama
 - `ollama pull qwen3:8b`下载模型
 - `ollama run qwen3:8b`同时启用交互式命令行以及http接口
 - `ollama serve`http服务模式启动所有模型
