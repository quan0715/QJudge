# Cloudflare Tunnel Setup Guide

This guide explains how to configure the Cloudflare Tunnel to expose your local QJudge instance to the internet at `https://qjudge.quan.wtf`.

## Prerequisites

*   A Cloudflare account with `quan.wtf` added as a site.
*   Access to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).

## Step 1: Create a Tunnel

1.  Log in to the **Cloudflare Zero Trust Dashboard**.
2.  Navigate to **Networks** > **Tunnels**.
3.  Click **Create a tunnel**.
4.  Select **Cloudflared** for the connector type and click **Next**.
5.  **Name your tunnel**: Enter a name like `qjudge-prod` and click **Save tunnel**.

## Step 2: Get the Tunnel Token

1.  In the "Install and run a connector" step, choose **Docker** as the environment.
2.  You will see a command that looks like this:
    ```bash
    docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoi...
    ```
3.  **Copy the long string** after `--token`. This is your `TUNNEL_TOKEN`.
    *   *Example Token*: `eyJhIjoiM2...` (it will be very long)

## Step 3: Configure Environment Variables

1.  Open your `.env` file in the project root (create it from `example.env` if you haven't already).
2.  Paste the token into the `TUNNEL_TOKEN` variable:
    ```env
    TUNNEL_TOKEN=eyJhIjoiM2...
    ```

## Step 4: Configure Public Hostname

1.  Back in the Cloudflare Tunnel setup wizard, click **Next**.
2.  **Public Hostnames** tab:
    *   **Subdomain**: `qjudge`
    *   **Domain**: `quan.wtf`
    *   **Path**: (Leave empty)
3.  **Service** section:
    *   **Type**: `HTTP`
    *   **URL**: `frontend:80`
        *   *Note*: We use `frontend` because that is the service name in our `docker-compose.yml`. Docker's internal DNS will resolve this to the frontend container.
4.  Click **Save tunnel**.

## Step 5: Start the Application

1.  Run the production docker-compose:
    ```bash
    docker compose up -d
    ```
2.  Check the logs to ensure the tunnel is connected:
    ```bash
    docker compose logs -f cloudflared
    ```
    You should see messages like "Registered tunnel connection".

## Verification

Visit `https://qjudge.quan.wtf` in your browser. It should load your application securely via HTTPS.
