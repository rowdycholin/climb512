FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /guardrails

COPY requirements.txt .
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ \
  && pip install --no-cache-dir -r requirements.txt \
  && apt-get purge -y --auto-remove g++ \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
COPY intake /configs-src/intake
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
