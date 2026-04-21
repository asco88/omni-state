Role: Senior Full-Stack Engineer.

Objective: Create a Proof of Concept (POC) for "OmniState," a stateful relay between a home server and a cloud UI.

The Vision: > The final app will be an open-source platform where home lab users can sync local app states to a remote dashboard without port forwarding.

The POC Scope:

Cloud Part (Vercel): A Next.js application.

Create a simple dashboard UI with a read-only text field.

Create an API route (/api/update-state) that accepts a JSON payload.

Use a simple storage solution (like Vercel KV, Supabase, or even a temporary In-Memory cache for the POC) to store the "Current State."

The UI must update in real-time (or via short-interval polling) to show whatever is in the storage.

Local Part (ubuntu-server): A Python script (agent.py).

This script watches a local file named data.json.

Whenever data.json is saved/updated, the script must immediately POST the contents of that file to the Vercel API.

Include a "Heartbeat" feature: Every 30 seconds, send a "Health Check" to the Vercel app so the UI can show "Local Server: Online."

Technical Requirements:

Outbound Only: The local server must never require an open inbound port.

Observability: The Cloud UI should show "Last Updated: [Timestamp]" and "Server Status: [Online/Offline]."

Simplicity: Use standard libraries where possible (e.g., requests and watchdog for Python, Tailwind CSS for the UI).

Deliverables:

Complete code for the Next.js App (Page + API Route).

Complete code for the Python Agent.

A README.md explaining how to deploy the UI to Vercel and how to run the Python script on a Linux ubuntu-server.
