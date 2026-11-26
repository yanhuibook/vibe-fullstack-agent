# New project generation mode

You are generating a local full-stack starter project from a confirmed specification. Return one valid JSON object and nothing else:
{
  "summary": "string",
  "files": [{"path": "relative/path", "content": "complete UTF-8 text file content"}],
  "manual_steps": ["string"]
}

Requirements:
- Use only the provided stack profile and project specification. Generate a coherent product and inventory management platform, not a Todo app.
- Public site: render `/`, `/help`, and `/contact` with ThinkPHP server-side templates. The home page has brand/navigation, concise platform description, core feature descriptions, four real aggregate statistics cards (total products, category count, on-sale products, low-stock warning count), and an `进入管理后台` button linking to `/admin/login`. The statistics must be queried from MySQL on page render and must not be hard-coded demo values. Do not show a signed-in user's name/avatar/account details, admin data, product rows, SKU values, exact stock quantities, or other user-level/private data. Expose aggregate counts only; do not add a public endpoint that returns product records or accepts arbitrary filters. The low-stock aggregate is intentionally public per the user request; document this information exposure.
- Admin: create a Vue 3 SPA built with Vite 5 and Element Plus 2.13.2. The dashboard, product management, inventory warnings, categories, and settings are inside the authenticated admin SPA. The admin UI calls ThinkPHP JSON APIs under `/api/admin`.
- Backend: PHP 8 + ThinkPHP 8 renders public pages and serves the JSON admin API. Keep routes, validation, API response shapes, and frontend calls consistent.
- Admin authentication is required. Do not create any self-service registration page, route, or API. Admin routes/APIs are protected except login and the one-time first-admin setup. Never generate default administrator credentials.
- Create the first admin only through a one-time local CLI bootstrap that is allowed only when no admin exists. Prompt for the password without echo, hash it with PHP `password_hash`/`PASSWORD_DEFAULT`, never print or log it, and store only the hash. If safe hidden input cannot be implemented for the target OS, document a safe manual bootstrap alternative rather than falling back to a default password.
- Use same-origin server-side sessions, rotate the session identifier after login, invalidate it on logout, use HttpOnly/SameSite cookies, and protect state-changing authenticated requests against CSRF. Add a Vue route guard; do not store plaintext passwords or session secrets in localStorage.
- Implement the modules in the profile: dashboard KPIs (visible only after login), product CRUD/search/filter/pagination, stock threshold warnings, stock adjustments with a movement history, and basic settings. Seed the six categories listed in the profile in MySQL; category selects and filters must load from the category table, never hard-code dropdown options in Vue. The default category comes from persisted system settings. Do not invent a separate category-management page unless requested.
- Product create form requires a name and includes a category dropdown. Match the profile list columns and page size. Validate SKU uniqueness, prevent negative stock, and record each stock adjustment. Low stock means current quantity is less than or equal to its threshold.
- Include a MySQL schema and README setup instructions. Do not claim tests were run or passed.
- Never generate a real `.env`, database password, API key, or secret. `.env.example` must contain placeholders only. Use an app-specific DB username, never root.
- Do not include lockfiles, node_modules, vendor, build output, binaries, migrations that run automatically, destructive SQL, shell scripts, or deployment configuration.
- Do not execute commands or connect to a database. `manual_steps` are displayed for the user and are never executed by this program.
- Keep the scaffold readable and limit scope to the profile. If a framework API or directory convention is uncertain, state that in the README instead of pretending it is verified.
