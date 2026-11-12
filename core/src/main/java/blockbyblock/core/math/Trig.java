/*
 * Java port of fdlibm 5.3 s_sin.c, s_cos.c, k_sin.c and k_cos.c (netlib.org/fdlibm).
 * Argument reduction lives in RemPio2.java.
 *
 * Original notice, preserved as required:
 *
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */
package blockbyblock.core.math;

/**
 * Sine and cosine computed with arithmetic only, so the JVM, TeaVM-compiled JavaScript and every
 * browser engine produce identical bits (ADR 0001 §5.2 rule 1). Results equal the JDK's
 * fdlibm-based strict math functions bit for bit.
 */
public final class Trig {
    private Trig() {}

    // k_sin.c
    private static final double HALF = 5.00000000000000000000e-01; /* 0x3FE00000, 0x00000000 */
    private static final double S1 = -1.66666666666666324348e-01; /* 0xBFC55555, 0x55555549 */
    private static final double S2 = 8.33333333332248946124e-03; /* 0x3F811111, 0x1110F8A6 */
    private static final double S3 = -1.98412698298579493134e-04; /* 0xBF2A01A0, 0x19C161D5 */
    private static final double S4 = 2.75573137070700676789e-06; /* 0x3EC71DE3, 0x57B1FE7D */
    private static final double S5 = -2.50507602534068634195e-08; /* 0xBE5AE5E6, 0x8A2B9CEB */
    private static final double S6 = 1.58969099521155010221e-10; /* 0x3DE5D93A, 0x5ACFD57C */

    // k_cos.c
    private static final double ONE = 1.00000000000000000000e+00; /* 0x3FF00000, 0x00000000 */
    private static final double C1 = 4.16666666666666019037e-02; /* 0x3FA55555, 0x5555554C */
    private static final double C2 = -1.38888888888741095749e-03; /* 0xBF56C16C, 0x16C15177 */
    private static final double C3 = 2.48015872894767294178e-05; /* 0x3EFA01A0, 0x19CB1590 */
    private static final double C4 = -2.75573143513906633035e-07; /* 0xBE927E4F, 0x809C52AD */
    private static final double C5 = 2.08757232129817482790e-09; /* 0x3E21EE9E, 0xBDB4B1C4 */
    private static final double C6 = -1.13596475577881948265e-11; /* 0xBDA8FAE9, 0xBE8838D4 */

    /** fdlibm __HI(x): the high 32 bits of x's IEEE representation. */
    static int hi(double x) { return (int) (Double.doubleToRawLongBits(x) >>> 32); }

    /** fdlibm __LO(x): the low 32 bits of x's IEEE representation. */
    static int lo(double x) { return (int) Double.doubleToRawLongBits(x); }

    /** Builds a double from fdlibm-style high and low words. */
    static double fromWords(int hi, int lo) {
        return Double.longBitsToDouble(((long) hi << 32) | (lo & 0xffffffffL));
    }

    /** s_sin.c */
    public static double sin(double x) {
        double[] y = new double[2];
        double z = 0.0;
        int n, ix;
        ix = hi(x);
        ix &= 0x7fffffff;
        if (ix <= 0x3fe921fb) return kernelSin(x, z, 0); /* |x| ~< pi/4 */
        else if (ix >= 0x7ff00000) return x - x; /* sin(Inf or NaN) is NaN */
        else { /* argument reduction needed */
            n = RemPio2.reduce(x, y);
            switch (n & 3) {
                case 0: return kernelSin(y[0], y[1], 1);
                case 1: return kernelCos(y[0], y[1]);
                case 2: return -kernelSin(y[0], y[1], 1);
                default: return -kernelCos(y[0], y[1]);
            }
        }
    }

    /** s_cos.c */
    public static double cos(double x) {
        double[] y = new double[2];
        double z = 0.0;
        int n, ix;
        ix = hi(x);
        ix &= 0x7fffffff;
        if (ix <= 0x3fe921fb) return kernelCos(x, z); /* |x| ~< pi/4 */
        else if (ix >= 0x7ff00000) return x - x; /* cos(Inf or NaN) is NaN */
        else { /* argument reduction needed */
            n = RemPio2.reduce(x, y);
            switch (n & 3) {
                case 0: return kernelCos(y[0], y[1]);
                case 1: return -kernelSin(y[0], y[1], 1);
                case 2: return -kernelCos(y[0], y[1]);
                default: return kernelSin(y[0], y[1], 1);
            }
        }
    }

    /** k_sin.c __kernel_sin(x, y, iy): iy=0 if y is zero. */
    static double kernelSin(double x, double y, int iy) {
        double z, r, v;
        int ix;
        ix = hi(x) & 0x7fffffff; /* high word of x */
        if (ix < 0x3e400000) { /* |x| < 2**-27 */
            if ((int) x == 0) return x; /* generate inexact */
        }
        z = x * x;
        v = z * x;
        r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
        if (iy == 0) return x + v * (S1 + z * r);
        else return x - ((z * (HALF * y - v * r) - y) - v * S1);
    }

    /** k_cos.c __kernel_cos(x, y) */
    static double kernelCos(double x, double y) {
        double a, hz, z, r, qx;
        int ix;
        ix = hi(x) & 0x7fffffff; /* ix = |x|'s high word */
        if (ix < 0x3e400000) { /* if x < 2**27 */
            if (((int) x) == 0) return ONE; /* generate inexact */
        }
        z = x * x;
        r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
        if (ix < 0x3FD33333) /* if |x| < 0.3 */
            return ONE - (0.5 * z - (z * r - x * y));
        else {
            if (ix > 0x3fe90000) { /* x > 0.78125 */
                qx = 0.28125;
            } else {
                qx = fromWords(ix - 0x00200000, 0); /* x/4 */
            }
            hz = 0.5 * z - qx;
            a = ONE - qx;
            return a - (hz - (z * r - x * y));
        }
    }
}
