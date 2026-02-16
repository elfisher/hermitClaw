# Tide Pool UI — Design System & Theming

This document outlines the design system, color palette, and component strategy for the HermitClaw "Tide Pool" web UI. The goal is a beautiful, minimal, and modern interface with a subtle crustacean theme.

## 1. UI Library & Styling

- **Component Library:** **MUI (Material-UI)**
  - **Reasoning:** MUI provides a comprehensive set of well-crafted, accessible, and themeable React components that follow Google's Material Design principles. This gives us a professional and consistent foundation to build upon, saving significant development time.

- **Styling Engine:** **Tailwind CSS**
  - **Reasoning:** Tailwind's utility-first approach allows for rapid, consistent styling directly in the markup. It's highly customizable and works well alongside component libraries like MUI, giving us fine-grained control over the final appearance without writing custom CSS for everything. We will configure Tailwind to work seamlessly with MUI.

## 2. Color Palette

The color palette is inspired by the ocean, with a focus on deep blues, sandy beiges, and coral accents. It is designed to be calming, professional, and accessible.

| Role | Color Name | Hex Code | Description |
| :--- | :--- | :--- | :--- |
| **Primary** | Midnight Blue | `#0D1B2A` | Main background, sidebar, dark elements. |
| **Secondary** | Pacific Blue | `#1B263B` | Card backgrounds, secondary surfaces. |
| **Accent** | Coral Red | `#E4572E` | Buttons, highlights, important actions. |
| **Text (Primary)** | Alabaster | `#E0E1DD` | Main text color on dark backgrounds. |
| **Text (Secondary)**| Slate Gray | `#778DA9` | Secondary text, placeholders, subtitles. |
| **Success** | Sea Green | `#2a9d8f` | Success messages, active status indicators. |
| **Error** | Crimson Red | `#e63946` | Error messages, destructive actions. |
| **Warning** | Sandy Yellow | `#fca311` | Warning notifications, pending status. |

## 3. Typography

- **Primary Font:** **Roboto**
  - **Reasoning:** As the default Material Design font, Roboto is clean, modern, and highly readable on all screen sizes. It's available in a wide range of weights, giving us typographic flexibility.
  - **Weights to use:** 300 (Light), 400 (Regular), 500 (Medium), 700 (Bold).

- **Monospace Font:** **Roboto Mono**
  - **Reasoning:** For displaying code snippets, API responses, or other technical information, Roboto Mono provides excellent readability and consistency with the primary font.

## 4. Layout & Components

### Global Layout

- **Structure:** A two-column layout featuring a fixed sidebar on the left for navigation and a main content area on the right.
- **Sidebar:** Will use the **Midnight Blue** background and contain navigation links with icons to the three main pages. The active link will be highlighted.
- **Content Area:** Will have a slightly lighter background to differentiate it from the sidebar and will contain the main content for each page.

### Reusable Components

We will build or style the following core components to match our theme:

- **Button:** Primary buttons will use the **Coral Red** accent color. Secondary buttons will be more subtle. Destructive action buttons (e.g., "Delete") will use **Crimson Red**.
- **Table:** A clean, modern table design for displaying lists of agents, secrets, and audit logs. It will support sorting and pagination.
- **Forms & Inputs:** Text fields, select dropdowns, and other form elements will follow Material Design's "filled" or "outlined" style, customized with our color palette.
- **Modals (Dialogs):** Used for confirmations (e.g., deleting a secret) and for creating new items (e.g., registering an agent).
- **Alerts/Toasts:** For providing feedback to the user (e.g., "Secret created successfully"). Will use the Success, Error, and Warning colors.

## 5. Page-Specific Design Notes

### Agents Page (`AgentsPage.tsx`)
- A table view of all registered agents.
- Columns: Agent Name, Status (Active/Revoked), Created At.
- A "Revoke" button for each active agent, which will open a confirmation modal.
- A "Register Agent" button to open a form for creating a new agent.

### Secrets Page (`SecretsPage.tsx`)
- A table view of all stored secrets.
- Columns: Service, Label, Associated Agent, Created At.
- Sensitive values will be masked (e.g., `••••••••••••`).
- A "Delete" button for each secret, which will open a confirmation modal.
- A "Create Secret" button to open a form for creating a new secret, including a dropdown to select the agent.

### Audit Log Page (`AuditLogPage.tsx`)
- A paginated table view of all audit log entries (`tides`).
- Columns: Timestamp, Agent, Direction (Egress/Ingress), Target URL, Status Code, Error.
- Rows with errors will be subtly highlighted (e.g., with a light red background).
- A filter bar at the top to filter logs by agent or status code.
