# ShieldNex Email Deliverability Verifier

## How It Works
This application batch-verifies email addresses by performing syntax validation, DNS MX record lookups, and SMTP handshakes to determine if an email is `delivered`, likely to `bounce`, or `unknown`. It safely disconnects the SMTP socket before sending any message data, ensuring no actual emails are sent to addresses during verification.

## Hosting Limitations (Port 25 Blocking)
Because this application is deployed on a free cloud hosting provider (e.g., Render/Railway), outbound connections on TCP Port 25 are blocked by the host's firewall to prevent spam. 
* **What the deployed version CAN check:** Syntax validity, disposable/role-based domains, and DNS MX record resolution. 
* **What the deployed version CANNOT check:** Active SMTP handshakes with the receiving mail server. Because of the Port 25 block, valid MX records will ultimately return an `unknown` status in the live production environment, as the host prevents the socket connection required to confirm mailbox existence. 

## How to Run Locally
Running the application locally bypasses cloud provider Port 25 blocks, allowing full SMTP handshakes.
1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the local development server.
4. Open `http://localhost:3000` in your browser.