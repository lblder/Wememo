#!/bin/zsh
# Run locally: zsh scripts/configure-deepseek.zsh
emulate -LR zsh
unsetopt XTRACE VERBOSE
setopt ERR_EXIT NO_CLOBBER
umask 077

config_dir="$HOME/.config/wememo"
config_file="$config_dir/deepseek.env"
if [[ -e "$config_file" || -L "$config_file" ]]; then
  print -u2 -- "配置文件已存在，未覆盖：$config_file"
  exit 1
fi
mkdir -p -- "$config_dir"
chmod 700 "$config_dir"
read -r 'model_base?Base URL [https://api.deepseek.com]: '
model_base=${model_base:-https://api.deepseek.com}
read -r 'model_id?Model ID [deepseek-flash]: '
model_id=${model_id:-deepseek-flash}
case "$model_base" in
  https://api.deepseek.com|https://api.deepseek.com/|https://api.deepseek.com/v1|https://api.deepseek.com/v1/) ;;
  *) print -u2 -- '请输入 DeepSeek 官方 HTTPS 地址。'; exit 1 ;;
esac
if [[ ! "$model_id" =~ '^deepseek-[a-z0-9.-]{1,80}$' ]]; then
  print -u2 -- '模型 ID 格式无效。'
  exit 1
fi
read -rs 'model_key?DeepSeek API Key（隐藏输入）: '
print
if [[ -z "$model_key" || "$model_key" == *$'\r'* || "$model_key" == *$'\n'* ]]; then
  print -u2 -- 'API Key 不能为空或包含换行。'
  exit 1
fi
{
  printf 'export WEMEMO_DEEPSEEK_BASE_URL=%q\n' "$model_base"
  printf 'export WEMEMO_DEEPSEEK_MODEL=%q\n' "$model_id"
  printf 'export WEMEMO_DEEPSEEK_API_KEY=%q\n' "$model_key"
} > "$config_file"
unset model_key
chmod 600 "$config_file"
print -- "已保存：$config_file（权限 600）"
print -- '在启动应用的终端运行：source "$HOME/.config/wememo/deepseek.env"'
