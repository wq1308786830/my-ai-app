### 模型部署
`CUDA_VISIBLE_DEVICES=0 vllm serve Qwen/Qwen3-1.7B   --port 8888   --host 0.0.0.0   --gpu-memory-utilization 0.85   --max-model-len 4096   --served-model-name qwen1.7b`