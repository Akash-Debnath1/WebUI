#!/usr/bin/env bash
#
# Localhost AI Chat Web UI - Linux/macOS Launcher
# start.bat-এর সমতুল্য শেল স্ক্রিপ্ট
#

set -e

# স্ক্রিপ্টের নিজের ডিরেক্টরিতে চলে যাও (যেখানেই থেকে রান করা হোক না কেন)
cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")"

PORT=8000
URL="http://localhost:${PORT}"

echo "======================================================="
echo "          Localhost AI Chat Web UI Server"
echo "======================================================="
echo ""
echo "Starting local web server with automatic CORS bypass..."
echo ""
echo "Application URL: ${URL}"
echo ""
echo "Press Ctrl+C in this terminal to stop the server."
echo "======================================================="
echo ""

# ব্রাউজার খোলার ফাংশন (ব্যাকগ্রাউন্ডে, যাতে সার্ভার স্টার্ট হতে আটকে না থাকে)
open_browser() {
  sleep 1
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v gnome-open >/dev/null 2>&1; then
    gnome-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    # macOS
    open "$URL" >/dev/null 2>&1 &
  else
    echo "Could not auto-detect a browser opener. Please open ${URL} manually."
  fi
}

open_browser

# python3 চেক করো
if command -v python3 >/dev/null 2>&1; then
  exec python3 server.py "$PORT"
fi

# fallback: python (কিছু সিস্টেমে python মানে python3)
if command -v python >/dev/null 2>&1; then
  exec python server.py "$PORT"
fi

# fallback: Node/npx
if command -v npx >/dev/null 2>&1; then
  exec npx serve -l "$PORT"
fi

echo "[ERROR] Python was not found on your system."
echo "Please install Python 3 (e.g. 'sudo apt install python3' or 'sudo dnf install python3')."
echo ""
read -p "Press Enter to exit..."
exit 1