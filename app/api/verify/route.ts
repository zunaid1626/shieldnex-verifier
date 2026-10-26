import dns from 'node:dns/promises';
import net from 'node:net';
import {
  parseEmails,
  validateEmailSyntax,
  evaluateEmail,
  EvaluationContext,
  KNOWN_MAJOR_DOMAINS,
  VerificationResult,
  VerificationSummary,
  BatchVerificationResponse,
} from '@/lib/email-verifier';

interface DomainResolution {
  hasMx: boolean | null;
  isNullMx: boolean;
  hasImplicitA: boolean;
  port25Status: 'connected' | 'blocked' | 'timeout' | 'untested';
  smtpServerStatus: 'cooperative' | 'uncooperative' | 'greylisted' | 'untested';
  dnsError: string | null;
  primaryMxHost?: string;
  timestamp: number;
}

// In-memory cache for domain resolution & SMTP diagnostics
const domainCache = new Map<string, DomainResolution>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Performs a lightweight TCP port 25 probe to distinguish host firewall blocks from server uncooperativeness
 */
async function probeSmtpPort25(
  host: string,
  timeoutMs = 700
): Promise<{
  port25Status: 'connected' | 'blocked' | 'timeout';
  smtpServerStatus: 'cooperative' | 'uncooperative' | 'greylisted';
}> {
  return new Promise((resolve) => {
    let resolved = false;

    const safeResolve = (
      result: {
        port25Status: 'connected' | 'blocked' | 'timeout';
        smtpServerStatus: 'cooperative' | 'uncooperative' | 'greylisted';
      }
    ) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
        try {
          socket.destroy();
        } catch {}
      }
    };

    const socket = net.createConnection(25, host);
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      // Socket connected! Wait for the initial 220 banner greeting
      socket.once('data', (chunk) => {
        const banner = chunk.toString();
        if (banner.startsWith('220')) {
          safeResolve({ port25Status: 'connected', smtpServerStatus: 'cooperative' });
        } else if (banner.startsWith('421') || banner.startsWith('451')) {
          safeResolve({ port25Status: 'connected', smtpServerStatus: 'greylisted' });
        } else {
          safeResolve({ port25Status: 'connected', smtpServerStatus: 'uncooperative' });
        }
      });
    });

    socket.on('timeout', () => {
      safeResolve({ port25Status: 'timeout', smtpServerStatus: 'uncooperative' });
    });

    socket.on('error', (err: { code?: string }) => {
      if (
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'EHOSTUNREACH' ||
        err.code === 'EACCES'
      ) {
        safeResolve({ port25Status: 'blocked', smtpServerStatus: 'uncooperative' });
      } else {
        safeResolve({ port25Status: 'timeout', smtpServerStatus: 'uncooperative' });
      }
    });
  });
}

/**
 * Resolves MX, A records, and SMTP socket connectivity for a domain
 */
async function resolveDomainDiagnostics(domain: string): Promise<DomainResolution> {
  const normalizedDomain = domain.toLowerCase().trim();

  // Instant fast-path for major known email providers
  if (KNOWN_MAJOR_DOMAINS.has(normalizedDomain)) {
    return {
      hasMx: true,
      isNullMx: false,
      hasImplicitA: false,
      port25Status: 'connected',
      smtpServerStatus: 'cooperative',
      dnsError: null,
      timestamp: Date.now(),
    };
  }

  // Check cache
  const cached = domainCache.get(normalizedDomain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }

  const result: DomainResolution = {
    hasMx: null,
    isNullMx: false,
    hasImplicitA: false,
    port25Status: 'untested',
    smtpServerStatus: 'untested',
    dnsError: null,
    timestamp: Date.now(),
  };

  try {
    // 1. Resolve MX records with 1200ms timeout
    const mxPromise = dns.resolveMx(normalizedDomain);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS_TIMEOUT')), 1200)
    );

    const mxRecords = await Promise.race([mxPromise, timeoutPromise]);

    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      // Check RFC 7505 Null MX (e.g. "0 .")
      if (
        mxRecords[0].exchange === '.' ||
        mxRecords[0].exchange === '' ||
        mxRecords[0].exchange === '0'
      ) {
        result.isNullMx = true;
        result.hasMx = false;
      } else {
        result.hasMx = true;
        // Sort by priority (lowest number first)
        mxRecords.sort((a, b) => a.priority - b.priority);
        result.primaryMxHost = mxRecords[0].exchange;

        // Perform socket probe on the primary MX host
        const probe = await probeSmtpPort25(result.primaryMxHost, 600);
        result.port25Status = probe.port25Status;
        result.smtpServerStatus = probe.smtpServerStatus;
      }
    } else {
      result.hasMx = false;
    }
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };

    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      result.hasMx = false;

      // Check for RFC 5321 implicit A-record fallback
      try {
        const aRecords = await dns.resolve4(normalizedDomain);
        if (Array.isArray(aRecords) && aRecords.length > 0) {
          result.hasImplicitA = true;
        }
      } catch {}
    } else if (error.message === 'DNS_TIMEOUT' || error.code === 'ETIMEOUT') {
      result.dnsError = 'DNS_TIMEOUT';
    } else if (error.code === 'ESERVFAIL') {
      result.dnsError = 'ESERVFAIL';
    }
  }

  domainCache.set(normalizedDomain, result);
  return result;
}

/**
 * POST /api/verify
 * Batch and single email verification endpoint
 */
export async function POST(request: Request) {
  const startTime = performance.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: 'Invalid JSON payload in request body' },
      { status: 400 }
    );
  }

  // Extract email strings from various supported body formats
  let rawEmails: string[] = [];

  if (Array.isArray(body)) {
    rawEmails = body.map((item) => (typeof item === 'string' ? item : ''));
  } else if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (Array.isArray(b.emails)) {
      rawEmails = b.emails.map((item) => (typeof item === 'string' ? item : ''));
    } else if (typeof b.email === 'string') {
      rawEmails = [b.email];
    } else if (typeof b.text === 'string') {
      rawEmails = parseEmails(b.text);
    }
  }

  const emails = parseEmails(rawEmails);

  if (emails.length === 0) {
    return Response.json(
      {
        success: false,
        error:
          'No valid email addresses provided. Pass an array of emails or a comma/newline-separated list.',
      },
      { status: 400 }
    );
  }

  const MAX_BATCH_SIZE = 250;
  if (emails.length > MAX_BATCH_SIZE) {
    return Response.json(
      {
        success: false,
        error: `Batch size exceeds the limit of ${MAX_BATCH_SIZE} emails per request.`,
      },
      { status: 400 }
    );
  }

  // Pre-collect unique valid domains to resolve diagnostics in parallel
  const uniqueDomains = new Set<string>();
  for (const email of emails) {
    const syntax = validateEmailSyntax(email);
    if (syntax.isValid) {
      uniqueDomains.add(syntax.domain);
    }
  }

  // Concurrently resolve diagnostics for unique domains
  const domainDiagnostics = new Map<string, DomainResolution>();
  await Promise.all(
    Array.from(uniqueDomains).map(async (domain) => {
      const diag = await resolveDomainDiagnostics(domain);
      domainDiagnostics.set(domain, diag);
    })
  );

  // Evaluate each email with full diagnostic context
  const results: VerificationResult[] = emails.map((email) => {
    const syntax = validateEmailSyntax(email);
    if (!syntax.isValid) {
      return evaluateEmail(email, { mxVerified: false });
    }

    const diag = domainDiagnostics.get(syntax.domain);
    const evalContext: EvaluationContext = {
      mxVerified: diag?.hasMx ?? null,
      isNullMx: diag?.isNullMx ?? false,
      hasImplicitA: diag?.hasImplicitA ?? false,
      port25Status: diag?.port25Status ?? 'untested',
      smtpServerStatus: diag?.smtpServerStatus ?? 'untested',
      dnsError: diag?.dnsError ?? null,
    };

    return evaluateEmail(email, evalContext);
  });

  const summary: VerificationSummary = {
    total: results.length,
    delivered: results.filter((r) => r.status === 'delivered').length,
    likelyToBounce: results.filter((r) => r.status === 'likely to bounce').length,
    unknown: results.filter((r) => r.status === 'unknown').length,
  };

  const durationMs = Math.round(performance.now() - startTime);

  const responsePayload: BatchVerificationResponse = {
    success: true,
    total: results.length,
    summary,
    results,
    durationMs,
  };

  return Response.json(responsePayload, { status: 200 });
}

/**
 * GET /api/verify
 * Single email lookup or API health information
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const emailParam = searchParams.get('email');

  if (!emailParam) {
    return Response.json(
      {
        status: 'healthy',
        service: 'ShieldNex Email Verifier API',
        version: '1.2.0',
        documentation: {
          methods: {
            POST: {
              description: 'Batch or single email verification with deep socket diagnostics',
              bodyExamples: [
                { emails: ['user@example.com', 'team@domain.org'] },
                { text: 'user@example.com\nteam@domain.org' },
                ['user@example.com'],
              ],
            },
            GET: {
              description: 'Single email verification query with diagnostic report',
              usage: '/api/verify?email=test@example.com',
            },
          },
          statusTypes: ['delivered', 'likely to bounce', 'unknown'],
        },
      },
      { status: 200 }
    );
  }

  const cleanEmails = parseEmails([emailParam]);
  if (cleanEmails.length === 0) {
    return Response.json(
      { success: false, error: 'Invalid email query parameter provided' },
      { status: 400 }
    );
  }

  const email = cleanEmails[0];
  const syntax = validateEmailSyntax(email);
  if (!syntax.isValid) {
    return Response.json(
      {
        success: true,
        result: evaluateEmail(email, { mxVerified: false }),
      },
      { status: 200 }
    );
  }

  const diag = await resolveDomainDiagnostics(syntax.domain);
  const evalContext: EvaluationContext = {
    mxVerified: diag.hasMx,
    isNullMx: diag.isNullMx,
    hasImplicitA: diag.hasImplicitA,
    port25Status: diag.port25Status,
    smtpServerStatus: diag.smtpServerStatus,
    dnsError: diag.dnsError,
  };

  const result = evaluateEmail(email, evalContext);

  return Response.json(
    {
      success: true,
      result,
    },
    { status: 200 }
  );
}
