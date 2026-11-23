package blockbyblock.core.text;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * How JavaScript prints numbers. Java's Double.toString uses different layouts (1.0E10, 3.0), so replies built on
 * the JS strings need these. Exact decimal arithmetic is used throughout, so the result does not depend on the
 * platform's own number formatting.
 */
public final class JsNumbers {
    private JsNumbers() {}

    /** JS {@code String(x)}: the shortest digits that read back as the same double, laid out by the ECMAScript rules. */
    public static String toString(double v) {
        if (Double.isNaN(v)) return "NaN";
        if (v == 0) return "0";
        if (v < 0) return "-" + toString(-v);
        if (Double.isInfinite(v)) return "Infinity";
        BigDecimal exact = new BigDecimal(v);
        for (int k = 1; k <= 17; k++) {
            BigDecimal candidate = exact.round(new MathContext(k, RoundingMode.HALF_EVEN));
            if (candidate.doubleValue() == v) return layout(candidate);
        }
        return layout(exact.round(new MathContext(17, RoundingMode.HALF_EVEN)));
    }

    /** JS {@code String(Number(x.toPrecision(8)))}: at most eight significant digits, as the chat replies show settings. */
    public static String numberText(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return toString(v);
        if (v == 0) return "0";
        return toString(new BigDecimal(v).round(new MathContext(8, RoundingMode.HALF_UP)).doubleValue());
    }

    /** Lays out a positive decimal with the digits and point position of ECMAScript Number::toString. */
    private static String layout(BigDecimal decimal) {
        String digits = decimal.unscaledValue().toString();
        int n = digits.length() - decimal.scale(); // value = 0.digits x 10^n
        int end = digits.length();
        while (end > 1 && digits.charAt(end - 1) == '0') end--;
        digits = digits.substring(0, end);
        int k = digits.length();
        StringBuilder out = new StringBuilder();
        if (k <= n && n <= 21) {
            out.append(digits);
            for (int i = 0; i < n - k; i++) out.append('0');
        } else if (0 < n && n <= 21) {
            out.append(digits, 0, n).append('.').append(digits, n, k);
        } else if (-6 < n && n <= 0) {
            out.append("0.");
            for (int i = 0; i < -n; i++) out.append('0');
            out.append(digits);
        } else {
            int exponent = n - 1;
            out.append(digits.charAt(0));
            if (k > 1) out.append('.').append(digits, 1, k);
            out.append('e').append(exponent < 0 ? '-' : '+').append(Math.abs(exponent));
        }
        return out.toString();
    }
}
