# Sherelle's Famous Fried Chicken — Payment Backend

Secure Square payment processing server.

## Environment Variables (set in Railway)
- `SQUARE_TOKEN` — Your Square Access Token
- `SQUARE_LOCATION` — Your Square Location ID

## Endpoints
- `GET /` — Health check
- `GET /verify` — Verify Square connection
- `POST /create-order` — Create a Square order
- `POST /process-payment` — Process a card payment
