# Third-Party Authentication Setup

By default, QJudge supports standard email and password login. If your school or institution prefers students and instructors to log in directly with their existing accounts (such as Google, GitHub, or NYCU single sign-on) with one click—eliminating the need to memorize another password—you can configure third-party authentication with this guide.

Third-party authentication is an **optional feature**. You can enable one or multiple providers at any time according to your institution's policies.

## Step 1: Obtain OAuth Credentials from the Provider

First, register an application in the developer console of the chosen platform to obtain a **Client ID** and **Client Secret**.

- **Google**: Go to [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services** > **Credentials** > **Create Credentials** > **OAuth Client ID** (select "Web application").
- **GitHub**: Go to GitHub **Settings** > **Developer settings** > **OAuth Apps** > **New OAuth App**.

### Most Critical Step: Setting the Callback URL

When entering application information in the provider console, you must set the **Authorized redirect URIs / Callback URL** to your QJudge frontend public URL:

```text
https://<your-domain>/auth/<provider>/callback
```

Specific examples:

- Google Callback URL: `https://judge.example.edu/auth/google/callback`
- GitHub Callback URL: `https://judge.example.edu/auth/github/callback`
- NYCU Callback URL: `https://judge.example.edu/auth/nycu/callback`

> **Important**: Ensure the URL begins with `https://` and points to the **frontend domain** with the `/auth/...` path—do not point it to the backend API address. If the URL is misconfigured, the provider will return a `redirect_uri_mismatch` error when users attempt to log in.

## Step 2: Configure Environment Variables on the Host

After obtaining credentials, connect to your QJudge host via SSH and edit the `.env` file in your deployment directory.

Only configure the providers you wish to enable (Client ID and Secret must be provided in pairs):

```env
# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-your-google-client-secret

# GitHub OAuth
GITHUB_OAUTH_CLIENT_ID=your-github-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-client-secret

# NYCU Campus SSO (National Yang Ming Chiao Tung University)
NYCU_OAUTH_CLIENT_ID=your-nycu-client-id
NYCU_OAUTH_CLIENT_SECRET=your-nycu-client-secret
```

## Step 3: (Optional) Enforce Third-Party Authentication

If you want the entire institution to log in exclusively via third-party providers and disable the standard email and password input fields, add this to `.env`:

```env
AUTH_EMAIL_PASSWORD_ENABLED=false
```

Once enabled, the login page displays only active third-party OAuth buttons and hides manual password registration.

## Step 4: Apply Configuration and Restart Services

Run the following command in the project directory on your host to reload environment variables:

```bash
docker compose -p qjudge up -d backend frontend
```

## Step 5: Verify the Login Flow

1. Open an incognito browser window and visit your QJudge login page (`https://<your-domain>/login`).
2. Verify that corresponding third-party login buttons (such as "Sign in with Google" or "Sign in with GitHub") appear on the page.
3. Click the button to confirm the browser redirects properly to the provider's OAuth authorization screen.
4. Complete the sign-in and authorization, and ensure the browser redirects back to the QJudge home page in an authenticated state.

## Account Identity and Role Boundaries

- **Automatic Account Creation**: When a user logs in via Google or GitHub for the first time, QJudge automatically creates a user profile with the default role of "Student".
- **Teacher Qualification Must Be Promoted by an Admin**: Even if the account belongs to a professor or lecturer's institutional email, it will not automatically become a Teacher. If they need to create classrooms and author exams, a site administrator must search for their account in User Management and promote them according to [Managing Teacher Qualifications](#/docs/teacher-qualification).

[Previous: Configuring MCP Connections](#/docs/mcp-setup) · [Return to Platform Overview](#/docs/overview)
