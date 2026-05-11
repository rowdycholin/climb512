FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /guardrails

COPY requirements.txt .
RUN apt-get update \
  && apt-get install -y --no-install-recommends g++ \
  && pip install --no-cache-dir -r requirements.txt \
  && python -c "from pathlib import Path; p = Path('/usr/local/lib/python3.11/site-packages/nemoguardrails/server/api.py'); s = p.read_text(); p.write_text(s.replace('LLMRails(config=full_llm_rails_config, verbose=True)', 'LLMRails(config=full_llm_rails_config, verbose=False)'))" \
  && apt-get purge -y --auto-remove g++ \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
COPY intake /configs-src/intake
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
