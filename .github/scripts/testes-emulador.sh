#!/usr/bin/env bash
# Corre dentro do emulador Android (reactivecircus/android-emulator-runner).
# Uso: bash .github/scripts/testes-emulador.sh <caminho do APK>
#
# 1. Instala o APK.
# 2. Envia um GPS falso no Huambo (a 2 m do limite de uma célula), uma vez por segundo.
# 3. Corre os fluxos do Maestro (.maestro/) pela ordem certa; pára no primeiro que falhar.
#    Sem os segredos TESTE_EMAIL/TESTE_PASSWORD, só verifica que a app abre.
# 4. Liga o modo avião antes do fluxo "sem rede" e desliga-o no fim.
# O resultado de cada passo fica em relatorio/passos.md (vai para o resumo da execução).
set -uo pipefail

APK="$1"
LAT="-12.7760877"
LNG="15.7391167"
mkdir -p capturas relatorio
: > relatorio/passos.md
falhou=0

adb install -r "$APK" || { echo "::error::Não foi possível instalar o APK no emulador."; exit 1; }

# GPS falso contínuo (a app faz a média de várias leituras seguidas).
( while true; do adb emu geo fix "$LNG" "$LAT" > /dev/null 2>&1 || true; sleep 1; done ) &
GPS_PID=$!
modo_aviao() { # modo_aviao enable|disable
  adb shell cmd connectivity airplane-mode "$1" > /dev/null 2>&1 || true
  if [ "$1" = enable ]; then adb shell svc wifi disable; adb shell svc data disable; else adb shell svc wifi enable; adb shell svc data enable; fi > /dev/null 2>&1 || true
}
trap 'kill "$GPS_PID" 2> /dev/null || true; modo_aviao disable' EXIT

correr() { # correr <descrição> <fluxo> [argumentos do maestro]
  local descricao="$1" fluxo="$2"; shift 2
  if [ "$falhou" = 1 ]; then
    echo "| $descricao | ⏭️ não correu (um passo anterior falhou) | — |" >> relatorio/passos.md
    return
  fi
  local inicio nome
  inicio=$(date +%s)
  nome=$(basename "$fluxo" .yaml)
  echo "::group::$descricao"
  if maestro test "$@" --debug-output "relatorio/$nome" "$fluxo"; then
    echo "| $descricao | ✅ | $(( $(date +%s) - inicio )) s |" >> relatorio/passos.md
  else
    echo "| $descricao | ❌ falhou | $(( $(date +%s) - inicio )) s |" >> relatorio/passos.md
    echo "::error::Falhou: $descricao (ver as capturas e o artefacto relatorio-maestro)."
    falhou=1
  fi
  echo "::endgroup::"
}

correr "A app abre e mostra o ecrã de entrada" .maestro/01_app_abre.yaml

if [ -z "${TESTE_EMAIL:-}" ] || [ -z "${TESTE_PASSWORD:-}" ]; then
  echo "::warning::Faltam os segredos TESTE_EMAIL e TESTE_PASSWORD: só se testou que a app abre."
  echo "| Entrar, Mapa, sem rede e Moradas | ⚠️ não correu: faltam os segredos TESTE_EMAIL e TESTE_PASSWORD | — |" >> relatorio/passos.md
else
  correr "Entrar com a conta de teste" .maestro/02_entrar.yaml -e TESTE_EMAIL="$TESTE_EMAIL" -e TESTE_PASSWORD="$TESTE_PASSWORD"
  correr "Mapa com rede (Plus Code, código confirmado, aviso de limite, província, descarregar mapa) e Moradas" .maestro/03_mapa_com_rede.yaml
  if [ "$falhou" = 0 ]; then modo_aviao enable; sleep 3; fi
  correr "Modo avião: fechar e abrir a app (mapa, código confirmado com data, província, Moradas)" .maestro/04_sem_rede.yaml
  modo_aviao disable
fi

exit "$falhou"
