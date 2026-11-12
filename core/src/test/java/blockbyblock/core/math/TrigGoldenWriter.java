package blockbyblock.core.math;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.SplittableRandom;

/** Writes StrictMath reference values that the TeaVM-compiled Trig must reproduce in every JS engine. */
public final class TrigGoldenWriter {
    public static void main(String[] args) throws IOException {
        StringBuilder out = new StringBuilder("x_bits,sin_bits,cos_bits\n");
        for (double x : TrigTest.SPECIAL) row(out, x);
        SplittableRandom r = new SplittableRandom(7);
        for (int i = 0; i < 5_000; i++) {
            int exp = r.nextInt(-30, 1024);
            row(out, Math.scalb(r.nextDouble(1.0, 2.0), exp) * (r.nextBoolean() ? 1 : -1));
        }
        Path file = Path.of(args[0]);
        Files.createDirectories(file.getParent());
        Files.writeString(file, out);
    }

    private static void row(StringBuilder out, double x) {
        out.append(hex(x)).append(',').append(hex(StrictMath.sin(x))).append(',').append(hex(StrictMath.cos(x))).append('\n');
    }

    private static String hex(double v) { return String.format("%016x", Double.doubleToRawLongBits(v)); }
}
