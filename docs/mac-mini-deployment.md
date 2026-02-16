# Guide: Securely Deploying HermitClaw on a Mac mini

This guide provides best practices for securing your HermitClaw instance when running it on a self-hosted server like a Mac mini. The most critical aspect of this is protecting the `MASTER_PEARL`, the master encryption key that protects all your stored credentials.

## The "Key to the Kingdom" Mental Model

Think of your Mac mini as a physical bank vault, and the `.env` file as a safe inside that vault. The `MASTER_PEARL` is the one and only key to that safe.

- HermitClaw's internal security (isolating agents, logging, etc.) is like having organized, locked boxes *inside* the safe.
- If an attacker can break into the main vault (your Mac mini) and find the key to the safe (the `MASTER_PEARL`), the security of the individual boxes becomes irrelevant.

Your goal is to make it as difficult as possible for anyone to get into the "vault" and find that "key".

## Tier 1: Essential Security Measures

These are the absolute minimum steps you should take to secure your deployment.

### 1. Set Strict File Permissions on `.env`

This is the most important step. Your `.env` file must be readable **only by your user account**.

Navigate to your `hermitClaw` project directory in your terminal and run this command:

```bash
chmod 600 .env
```

This command ensures that only the file's owner (you) can read and write to it.

### 2. Use a Strong User Password

Your macOS user account password is the first line of defense.
- Use a strong, unique password.
- Go to **System Settings > Lock Screen** and set "Require password after screen saver begins or display is turned off" to **immediately**.

### 3. Enable FileVault (Full-Disk Encryption)

If someone physically steals your Mac mini, FileVault prevents them from accessing your data without your password.

- Go to **System Settings > Privacy & Security > FileVault**.
- If it's off, **turn it on**.

### 4. Enable the macOS Firewall

This provides a crucial layer of defense against unsolicited incoming network connections.

- Go to **System Settings > Network > Firewall**.
- If it's off, **turn it on**.

## Tier 2: Hardening the Operating System

These steps further reduce the attack surface of your Mac mini.

### 1. Limit Remote Access

Disable any sharing services you don't actively use.

- Go to **System Settings > General > Sharing**.
- Turn off services like **Screen Sharing**, **File Sharing**, **Remote Login (SSH)**, and **Remote Management** unless you have a specific, secure use case for them.
- If you *do* need SSH access, disable password-based authentication and use only SSH keys.

### 2. Keep Software Updated

Regularly install updates for macOS and all your applications. These updates often contain critical security patches.
- Enable automatic updates for system software and App Store apps.

### 3. Be Mindful of Installed Software

Only install applications from trusted sources (the Mac App Store or directly from reputable developers). Malware running on your system could potentially access and exfiltrate your `.env` file if it gains sufficient permissions.

## Tier 3: Advanced Security (Optional)

For users with a higher threat model or for those who want the most robust security posture possible.

### 1. Run HermitClaw Under a Dedicated User Account

Create a new, standard (non-administrator) user account on your Mac mini solely for running the HermitClaw server.

- **Benefit:** This isolates the HermitClaw process. Even if your main user account is compromised, the attacker would not have the necessary permissions to read the `.env` file stored in the dedicated HermitClaw user's home directory.

### 2. Use an External Secrets Manager

While the `.env` file is a reasonable approach for a physically secure home server, the gold standard is to not have the `MASTER_PEARL` on disk at all.

- **How it works:** You would run a secrets management tool like [HashiCorp Vault](https://www.vaultproject.io/) or a self-hosted instance of [Bitwarden](https://bitwarden.com/). At startup, HermitClaw would be configured to fetch the `MASTER_PEARL` from this external service instead of the `.env` file.
- **Benefit:** This is the most secure method, as the master key is never stored on the same machine in a simple text file. This is significantly more complex to set up but is the recommended approach for any production or shared environment.
