#!/usr/bin/env bash
# install-docker.sh — Install Docker Engine and start the daemon (Debian/Ubuntu)
#
# Usage:
#   sudo ./scripts/install-docker.sh              # root mode (default)
#   sudo ./scripts/install-docker.sh --rootless   # rootless mode for SUDO_USER
#
# Root mode:    installs Docker Engine system-wide, starts dockerd as root.
# Rootless mode: installs prerequisites as root, then configures and starts
#                dockerd-rootless for the invoking non-root user. No daemon
#                runs as root; each user has their own isolated daemon.
#
# Both modes are idempotent: safe to re-run.

set -euo pipefail

ROOTLESS=false
for arg in "$@"; do
  case "$arg" in
    --rootless) ROOTLESS=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# ── helpers ──────────────────────────────────────────────────────────────────
info()  { echo "[docker-install] $*"; }
error() { echo "[docker-install] ERROR: $*" >&2; exit 1; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    error "This script must be run as root or with sudo."
  fi
}

# ── detect distro ─────────────────────────────────────────────────────────────
detect_distro() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    DISTRO_ID="${ID:-}"
    DISTRO_VERSION_ID="${VERSION_ID:-}"
  else
    error "Cannot detect OS. /etc/os-release not found."
  fi

  case "$DISTRO_ID" in
    ubuntu|debian|linuxmint|pop) ;;
    *) error "Unsupported distro: $DISTRO_ID. Only Debian/Ubuntu-based systems are supported." ;;
  esac

  info "Detected: $DISTRO_ID $DISTRO_VERSION_ID"
}

# ── ROOT MODE ─────────────────────────────────────────────────────────────────

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    info "Docker already installed: $(docker --version)"
    return
  fi

  info "Installing Docker Engine via official script..."
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
  info "Docker installed: $(docker --version)"
}

install_compose() {
  if docker compose version >/dev/null 2>&1; then
    info "Docker Compose already available: $(docker compose version)"
    return
  fi

  info "Installing Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin
  info "Docker Compose installed: $(docker compose version)"
}

# Start dockerd manually (no systemctl) — root mode only.
start_docker() {
  if docker info >/dev/null 2>&1; then
    info "Docker daemon is already running."
    return
  fi

  info "Starting Docker daemon as root (logging to /tmp/docker.log)..."
  nohup dockerd >> /tmp/docker.log 2>&1 &

  for i in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then
      info "Docker daemon is up (pid $!)."
      return
    fi
    sleep 1
  done

  error "Docker daemon did not become ready within 30 seconds. Check /tmp/docker.log."
}

add_user_to_group() {
  local target_user="${SUDO_USER:-}"
  if [ -z "$target_user" ] || [ "$target_user" = "root" ]; then
    return
  fi

  if id -nG "$target_user" | grep -qw docker; then
    info "User '$target_user' is already in the docker group."
    return
  fi

  info "Adding '$target_user' to the docker group..."
  usermod -aG docker "$target_user"
  info "Re-login (or run 'newgrp docker') for the group change to take effect."
}

# ── ROOTLESS MODE ─────────────────────────────────────────────────────────────

# Install packages required for rootless operation.
# docker-ce-rootless-extras provides dockerd-rootless.sh and dockerd-rootless-setuptool.sh.
# uidmap provides newuidmap / newgidmap which the rootless daemon needs to create
# user namespaces.
install_rootless_prereqs() {
  info "Installing rootless prerequisites (uidmap, docker-ce-rootless-extras)..."
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates uidmap

  if ! command -v docker >/dev/null 2>&1; then
    info "Installing Docker Engine packages..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
  fi

  apt-get install -y -qq docker-ce-rootless-extras docker-compose-plugin
  info "Rootless prerequisites installed."
}

# Ensure /etc/subuid and /etc/subgid contain at least 65 536 subordinate
# IDs for the target user — required for user-namespace creation.
setup_subuid_subgid() {
  local target_user="$1"

  for file in /etc/subuid /etc/subgid; do
    # Touch the file if it doesn't exist yet
    [ -f "$file" ] || touch "$file"

    if grep -q "^${target_user}:" "$file"; then
      info "$(basename "$file"): entry for '${target_user}' already present."
      continue
    fi

    # Find the next non-overlapping start (max end of existing ranges, min 100000)
    local next_id
    next_id=$(awk -F: 'BEGIN{m=100000} {end=$2+$3; if(end>m) m=end} END{print m}' "$file")
    echo "${target_user}:${next_id}:65536" >> "$file"
    info "$(basename "$file"): added '${target_user}:${next_id}:65536'."
  done
}

# Ensure the XDG_RUNTIME_DIR for the user exists and is writable.
# On systems without systemd-logind this directory may not be created automatically.
ensure_runtime_dir() {
  local uid="$1"
  local dir="/run/user/${uid}"

  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    chmod 700 "$dir"
    chown "${uid}:" "$dir"
    info "Created XDG_RUNTIME_DIR: ${dir}"
  fi
}

# Run dockerd-rootless-setuptool.sh as the target user to lay down configs.
# On systems without systemd the tool exits non-zero after printing a "systemd
# not found" warning — that is expected; we start the daemon manually below.
run_rootless_setup() {
  local target_user="$1"
  local uid
  uid=$(id -u "$target_user")
  local xdg_runtime="/run/user/${uid}"

  ensure_runtime_dir "$uid"

  info "Running dockerd-rootless-setuptool.sh install as '${target_user}'..."
  su - "$target_user" -c "
    export XDG_RUNTIME_DIR=${xdg_runtime}
    export PATH=/usr/bin:\$PATH
    dockerd-rootless-setuptool.sh install 2>&1
  " || info "Setup tool exited non-zero (likely no systemd — daemon will be started manually)."
}

# Start the rootless Docker daemon as the target user (no systemd).
start_rootless_docker() {
  local target_user="$1"
  local uid
  uid=$(id -u "$target_user")
  local xdg_runtime="/run/user/${uid}"
  local sock="${xdg_runtime}/docker.sock"
  local log="/tmp/docker-rootless-${target_user}.log"

  # Already running?
  if [ -S "$sock" ]; then
    info "Rootless Docker socket already exists at ${sock}."
    return
  fi

  info "Starting rootless Docker daemon for '${target_user}' (logging to ${log})..."
  su - "$target_user" -c "
    export XDG_RUNTIME_DIR=${xdg_runtime}
    export PATH=/usr/bin:\$PATH
    nohup dockerd-rootless.sh >> ${log} 2>&1 &
  "

  for i in $(seq 1 30); do
    if [ -S "$sock" ]; then
      info "Rootless Docker daemon is up. Socket: ${sock}"
      return
    fi
    sleep 1
  done

  error "Rootless daemon did not start within 30 seconds. Check ${log}."
}

print_rootless_env() {
  local target_user="$1"
  local uid
  uid=$(id -u "$target_user")
  local xdg_runtime="/run/user/${uid}"

  echo ""
  info "Rootless Docker is installed and running for user '${target_user}'."
  info "Add the following to ~${target_user}/.bashrc (or equivalent):"
  echo ""
  echo "    export XDG_RUNTIME_DIR=${xdg_runtime}"
  echo "    export DOCKER_HOST=unix://${xdg_runtime}/docker.sock"
  echo "    export PATH=/usr/bin:\$PATH"
  echo ""
  info "Then verify with:"
  info "  docker info                # should show 'rootless' in security options"
  info "  docker compose version     # verify Compose plugin"
  echo ""
  info "To start the daemon after a reboot (no systemd):"
  info "  XDG_RUNTIME_DIR=${xdg_runtime} dockerd-rootless.sh &"
  echo ""
}

# ── main ──────────────────────────────────────────────────────────────────────
main() {
  require_root
  detect_distro

  if "$ROOTLESS"; then
    local target_user="${SUDO_USER:-}"
    if [ -z "$target_user" ] || [ "$target_user" = "root" ]; then
      error "Rootless mode requires a non-root invoking user. Run: sudo $0 --rootless"
    fi

    install_rootless_prereqs
    setup_subuid_subgid "$target_user"
    run_rootless_setup "$target_user"
    start_rootless_docker "$target_user"
    print_rootless_env "$target_user"
  else
    install_docker
    install_compose
    start_docker
    add_user_to_group

    echo ""
    info "All done. Docker is installed and running."
    info "  docker info             # verify daemon"
    info "  docker compose version  # verify Compose plugin"
    echo ""
  fi
}

main "$@"
