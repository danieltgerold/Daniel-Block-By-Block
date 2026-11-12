package blockbyblock.core.math;

import static java.lang.Double.doubleToRawLongBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.SplittableRandom;
import org.junit.jupiter.api.Test;

/** Trig must reproduce StrictMath (fdlibm) bit for bit, so every runtime computes identical physics. */
class TrigTest {
    static final double[] SPECIAL = {0.0, -0.0, Double.MIN_VALUE, -Double.MIN_VALUE, Double.MIN_NORMAL,
        Double.MAX_VALUE, -Double.MAX_VALUE, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY,
        Math.PI / 4, Math.nextUp(Math.PI / 4), Math.nextDown(Math.PI / 4), Math.PI / 2, Math.PI,
        0x1.921fb54442d18p20, Math.nextUp(0x1.921fb54442d18p20), Math.nextDown(0x1.921fb54442d18p20),
        // First input above the medium-size branch (high word 0x413921FC): the true large-argument boundary.
        Double.longBitsToDouble(0x413921FC00000000L), Math.nextDown(Double.longBitsToDouble(0x413921FC00000000L)),
        38295.9, 1e6, 1e22, 1e300, -1234.5678};

    static void assertSameBits(double x) {
        assertEquals(doubleToRawLongBits(StrictMath.sin(x)), doubleToRawLongBits(Trig.sin(x)), () -> "sin x=" + x);
        assertEquals(doubleToRawLongBits(StrictMath.cos(x)), doubleToRawLongBits(Trig.cos(x)), () -> "cos x=" + x);
    }

    @Test void matchesStrictMathOnSpecialValues() {
        for (double x : SPECIAL) assertSameBits(x);
        for (int n = 1; n <= 200_000; n++) assertSameBits(n * (Math.PI / 2)); // results near zero
    }

    @Test void matchesStrictMathOnTwoMillionRandomInputs() {
        SplittableRandom r = new SplittableRandom(42);
        for (int i = 0; i < 2_000_000; i++) {
            int exp = r.nextInt(-30, 1024); // small, moderate and huge arguments
            double x = Math.scalb(r.nextDouble(1.0, 2.0), exp) * (r.nextBoolean() ? 1 : -1);
            assertSameBits(x);
        }
    }

    @Test void nanInNanOut() {
        assertTrue(Double.isNaN(Trig.sin(Double.NaN)));
        assertTrue(Double.isNaN(Trig.cos(Double.NaN)));
    }
}
