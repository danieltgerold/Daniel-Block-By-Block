package blockbyblock.core.golden;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Reads the golden CSVs written by tools/golden/generate.mjs. */
public final class GoldenCsv {
    private GoldenCsv() {}

    /** tests/golden, passed in by Gradle as the golden.dir system property. */
    public static Path dir() {
        String dir = System.getProperty("golden.dir");
        if (dir == null) throw new IllegalStateException("golden.dir system property is not set");
        return Path.of(dir);
    }

    /** Data rows without the header; empty fields are kept (an empty jumpVelocity means "absent"). */
    public static List<String[]> read(Path file) {
        try {
            List<String> lines = Files.readAllLines(file);
            List<String[]> rows = new ArrayList<>(lines.size());
            for (int i = 1; i < lines.size(); i++) {
                if (!lines.get(i).isEmpty()) rows.add(lines.get(i).split(",", -1));
            }
            return rows;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Parses JS String(n) output, including -0, Infinity and NaN, to the exact double. */
    public static double num(String s) { return Double.parseDouble(s); }

    public static boolean bool(String s) { return s.equals("1"); }

    /** Bit-exact equality: -0 differs from +0; any NaN equals any NaN (payloads are not portable). */
    public static boolean sameBits(double expected, double actual) {
        if (Double.isNaN(expected) && Double.isNaN(actual)) return true;
        return Double.doubleToRawLongBits(expected) == Double.doubleToRawLongBits(actual);
    }
}
