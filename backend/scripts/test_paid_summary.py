import base64
import json
import os
import sys

import algosdk
import httpx
from algosdk.v2client import algod


API_BASE = "http://127.0.0.1:8000"
API_KEY = "ether-browser-dev"
TEST_URL = "https://stackoverflow.com/questions/67631/how-to-run-virtualenv-python-on-mac"
TEST_HTML = """
<html>
  <body>
    <article>
      <h1>how to run virtualenv python on mac</h1>
      <p>I am trying to use virtualenv to create a virtual python environment on my mac.</p>
      <p>Here is the command I have run and the response.</p>
    </article>
  </body>
</html>
""".strip()


def b64encode_text(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("utf-8")


def main() -> int:
    raw_key = os.getenv("ETHER_TEST_PRIVKEY", "").strip()
    if not raw_key:
        print("Missing ETHER_TEST_PRIVKEY in environment.", file=sys.stderr)
        return 1

    secret_key_bytes = base64.b64decode(raw_key)
    secret_key_b64 = base64.b64encode(secret_key_bytes).decode("utf-8")
    sender = algosdk.account.address_from_private_key(secret_key_b64)

    payload = {"url": TEST_URL, "html": TEST_HTML}
    headers = {"Content-Type": "application/json", "X-Ether-Key": API_KEY}

    with httpx.Client(timeout=30.0) as client:
        paid_response = client.post(f"{API_BASE}/api/summarize/paid", headers=headers, json=payload)
        print(f"paid_response_status={paid_response.status_code}")
        if paid_response.status_code != 402:
            print(paid_response.text)
            return 1

        encoded = paid_response.headers.get("payment-required")
        if not encoded:
            print("Missing payment-required header.", file=sys.stderr)
            return 1

        payment_required = json.loads(base64.b64decode(encoded).decode("utf-8"))
        accepted = payment_required["accepts"][0]
        note_text = accepted["extra"]["noteText"]
        amount = int(accepted["amount"])
        receiver = accepted["payTo"]

        algod_client = algod.AlgodClient("", "https://testnet-api.algonode.cloud", headers={})
        params = algod_client.suggested_params()
        txn = algosdk.transaction.PaymentTxn(
            sender=sender,
            sp=params,
            receiver=receiver,
            amt=amount,
            note=note_text.encode("utf-8"),
        )
        signed = txn.sign(secret_key_b64)
        send_result = algod_client.send_transaction(signed)
        tx_id = send_result if isinstance(send_result, str) else str(send_result)
        print(f"sent_tx_id={tx_id}")

        algosdk.transaction.wait_for_confirmation(algod_client, tx_id, 20)
        print("confirmed=true")

        payment_signature = b64encode_text(
            json.dumps(
                {
                    "x402Version": int(payment_required.get("x402Version") or 2),
                    "payload": {"txId": tx_id, "address": sender},
                    "accepted": accepted,
                    "resource": payment_required.get("resource") or {"url": TEST_URL},
                    "extensions": payment_required.get("extensions"),
                }
            )
        )

        confirm_headers = {
            "Content-Type": "application/json",
            "X-Ether-Key": API_KEY,
            "PAYMENT-SIGNATURE": payment_signature,
        }
        confirm_response = client.post(
            f"{API_BASE}/api/payments/confirm",
            headers=confirm_headers,
            json={"resource": TEST_URL},
        )
        print(f"confirm_response_status={confirm_response.status_code}")
        print(confirm_response.text)

        retry_headers = {
            "Content-Type": "application/json",
            "X-Ether-Key": API_KEY,
            "PAYMENT-SIGNATURE": payment_signature,
        }
        retry_response = client.post(f"{API_BASE}/api/summarize/paid", headers=retry_headers, json=payload)
        print(f"retry_response_status={retry_response.status_code}")
        print(retry_response.text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
