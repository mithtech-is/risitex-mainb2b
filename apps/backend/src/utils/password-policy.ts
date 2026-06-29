/**
 * Password policy for Risitex customer + admin accounts.
 *
 * Hard requirements (reject on fail):
 *   • ≥ 12 characters (14+ preferred — no penalty below 14, just a hint)
 *   • ≥ 1 uppercase letter
 *   • ≥ 1 lowercase letter
 *   • ≥ 1 digit
 *   • ≥ 1 special character from !@#$%^&*()_+-=[]{}|;:,.<>?/~`
 *   • No whitespace
 *   • Not in the top-1000 "common password" list
 *   • Doesn't contain any `contextual` identifier (email-local-part,
 *     first name, last name, phone digits, PAN, DOB). A fintech-
 *     specific addition — stock brute-forcers feed phone/PAN from
 *     the Aadhaar leak as wordlists.
 *
 * Soft hint (not blocking): 14+ characters scores better.
 *
 * No reuse of last N passwords is enforced SEPARATELY via the
 * password-history table + checker (see password-history.ts).
 *
 * The function is pure + deterministic so both the storefront (client-
 * side live validation) and the backend (server-side authoritative
 * check) call it and agree.
 */

export type PasswordPolicyCheck =
    | { ok: true; strength: "good" | "strong" }
    | { ok: false; errors: string[]; suggestions: string[] };

export type PasswordContext = {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    pan?: string | null;
    /** `YYYY-MM-DD` or any substring — we test digit-only variants too. */
    dob?: string | null;
};

/**
 * Minimal built-in common-password set. A thousand most-breached
 * passwords is the industry floor (NIST SP 800-63B leans into this).
 * The list here is a curated subset — we deliberately avoid pulling in
 * a 100k-entry wordlist because the check is also run client-side and
 * the bundle cost isn't worth it. A future improvement is to ship a
 * bloom filter / have-i-been-pwned k-anonymity lookup.
 *
 * Entries are all lower-case; the check lowers the input first.
 */
const COMMON_PASSWORDS = new Set<string>([
    "password", "password1", "password123", "password1234", "p@ssword",
    "passw0rd", "p@ssw0rd", "p@ssw0rd!", "passw0rd!", "passw0rd123",
    "welcome", "welcome1", "welcome123", "welcome@1", "welcome@123",
    "admin", "admin123", "admin@123", "admin1234", "administrator",
    "qwerty", "qwerty123", "qwertyuiop", "qazwsx", "asdfgh", "zxcvbn",
    "letmein", "letmein123", "trustno1", "iloveyou", "monkey", "dragon",
    "football", "baseball", "sunshine", "shadow", "master",
    "12345", "123456", "1234567", "12345678", "123456789", "1234567890",
    "111111", "000000", "654321", "987654321",
    "abc123", "abcd1234", "abcdef", "abcdefgh",
    "password!", "password@", "password#", "password$",
    "india@123", "india123", "bharat123", "mumbai123", "delhi123",
    "summer2024", "winter2024", "autumn2024", "spring2024",
    "summer2025", "winter2025", "autumn2025", "spring2025",
    "summer2026", "winter2026", "autumn2026", "spring2026",
    "changeme", "change123", "changeme123", "default", "default123",
    "test", "test123", "test1234", "testing", "testing123",
    "polemarch", "polemarch123", "polemarch@1", "polemarch@123",
    "calcula", "calcula123", "calcula@1", "calcula@123",
    "investor", "investor1", "investor123",
]);

const SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`]/;
const UPPER_RE = /[A-Z]/;
const LOWER_RE = /[a-z]/;
const DIGIT_RE = /[0-9]/;
const WHITESPACE_RE = /\s/;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_SUGGESTED_LENGTH = 14;
export const PASSWORD_MAX_LENGTH = 128;

/** Split "contextual" free-form text into token chunks for the
 *  substring-containment check. Returns lowercased tokens with
 *  enough length to be worth testing (short tokens collide with
 *  normal English). */
function contextTokens(ctx: PasswordContext): string[] {
    const tokens = new Set<string>();
    const add = (v: string | null | undefined, minLen = 3) => {
        if (!v) return;
        const clean = v.toLowerCase().trim();
        if (!clean) return;
        // Add the raw trimmed value + any digit-only slice (phone, DOB).
        if (clean.length >= minLen) tokens.add(clean);
        const digits = clean.replace(/\D/g, "");
        if (digits.length >= minLen) tokens.add(digits);
        // Split on non-word and add long-enough chunks.
        clean.split(/[^a-z0-9]+/).forEach((part) => {
            if (part.length >= minLen) tokens.add(part);
        });
    };

    if (ctx.email) {
        // The local part (before @) is a common brute-force anchor.
        const local = ctx.email.split("@")[0] ?? "";
        add(local, 3);
    }
    add(ctx.firstName, 3);
    add(ctx.lastName, 3);
    add(ctx.phone, 6); // 6 digits of phone is meaningful; don't flag "91" etc.
    add(ctx.pan, 5);
    add(ctx.dob, 4);

    return [...tokens];
}

/**
 * Run a password through the policy. Returns either `{ok:true}` or
 * `{ok:false, errors, suggestions}`. Keep error strings user-friendly
 * — they render directly in the signup / reset UI.
 */
export function validatePasswordPolicy(
    password: string,
    ctx: PasswordContext = {},
): PasswordPolicyCheck {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (typeof password !== "string" || password.length === 0) {
        return { ok: false, errors: ["Password is required."], suggestions: [] };
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
        errors.push(`Password is too long (max ${PASSWORD_MAX_LENGTH} characters).`);
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        errors.push(`Must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (!UPPER_RE.test(password)) {
        errors.push("Include at least one uppercase letter (A–Z).");
    }
    if (!LOWER_RE.test(password)) {
        errors.push("Include at least one lowercase letter (a–z).");
    }
    if (!DIGIT_RE.test(password)) {
        errors.push("Include at least one number (0–9).");
    }
    if (!SPECIAL_RE.test(password)) {
        errors.push("Include at least one special character (e.g. !@#$%^&*).");
    }
    if (WHITESPACE_RE.test(password)) {
        errors.push("Password must not contain spaces.");
    }

    const lowered = password.toLowerCase();
    if (COMMON_PASSWORDS.has(lowered)) {
        errors.push("That password is on a public breach list. Pick something unique.");
    }

    // Soft repetition / sequence check (e.g. "aaaaaaaaaaaa").
    if (/^(.)\1+$/.test(password)) {
        errors.push("Password can't be a single repeated character.");
    }
    if (/0123456789|1234567890|abcdefghij|qwertyuiop/i.test(password)) {
        errors.push("Password can't be a common keyboard sequence.");
    }

    // Contextual identifier check — if any personal-info token appears
    // as a substring, reject. Tokens are ≥ 3 chars so we don't trip
    // on random 2-letter matches.
    const tokens = contextTokens(ctx);
    for (const t of tokens) {
        if (lowered.includes(t)) {
            errors.push(
                "Password can't contain your name, email, phone, PAN, or date of birth.",
            );
            break;
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors, suggestions };
    }

    if (password.length < PASSWORD_SUGGESTED_LENGTH) {
        suggestions.push(
            `Good. For extra strength consider ${PASSWORD_SUGGESTED_LENGTH}+ characters or a passphrase.`,
        );
    }

    return {
        ok: true,
        strength: password.length >= PASSWORD_SUGGESTED_LENGTH ? "strong" : "good",
    };
}
