const PATTERNS = [
  /((?:api[_-]?key|secret|password|token)\s*[:=]\s*)\S+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{10,}/gi,
  /\bLLM[|A-Za-z0-9_-]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(ghp|gho|github_pat)_[A-Za-z0-9_]{10,}\b/g,
];

export function scrubSecrets(text) {
  let out = String(text ?? "");
  let count = 0;
  for (const re of PATTERNS) {
    out = out.replace(re, (m, prefix) => {
      count += 1;
      return prefix && m.startsWith(prefix) ? `${prefix}[REDACTED]` : "[REDACTED]";
    });
  }
  return { text: out, redactions: count };
}
