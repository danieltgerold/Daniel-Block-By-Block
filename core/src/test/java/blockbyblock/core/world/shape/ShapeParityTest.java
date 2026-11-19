package blockbyblock.core.world.shape;

import static blockbyblock.core.golden.GoldenCsv.num;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

/** Java geometry must reproduce the independently recorded JS shape references. */
class ShapeParityTest {
    private static final String CASE_HEADER = "case,category,id,kind,mask,x,y,z,type,facing,half,stairShape,hinge,open,boxCount,fullCube,opaque,solid,shape,definitionOpaque";
    private static final String BOX_HEADER = "case,index,minX,minY,minZ,maxX,maxY,maxZ";

    @Test void matchesEveryJsBoxInOrderAndByRawBits() throws IOException {
        List<String[]> cases = readFixture("cases.csv", CASE_HEADER);
        List<String[]> boxes = readFixture("boxes.csv", BOX_HEADER);
        assertEquals(404, cases.size(), "case coverage changed; review the fixture contract");
        assertEquals(964, boxes.size(), "coordinate coverage changed; review the fixture contract");
        int cursor = 0;
        // Exactly the 404 recorded cases; each case contributes at most nine boxes.
        for (int i = 0; i < cases.size(); i++) {
            String[] row = cases.get(i);
            assertEquals(i, Integer.parseInt(row[0]), "duplicate, missing or reordered case");
            cursor = replayCase(row, boxes, cursor);
        }
        assertEquals(boxes.size(), cursor, "orphan coordinate rows");
    }

    private static List<String[]> readFixture(String file, String header) throws IOException {
        var path = GoldenCsv.dir().resolve("shapes").resolve(file);
        try (var lines = Files.lines(path)) {
            assertEquals(header, lines.findFirst().orElseThrow(), "fixture schema: " + file);
        }
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(!rows.isEmpty(), "empty fixture: " + file);
        int width = header.split(",").length;
        // Bounded by the finite input fixture's row count.
        for (String[] row : rows) assertEquals(width, row.length, "malformed row: " + file);
        return rows;
    }

    private static int replayCase(String[] row, List<String[]> expected, int cursor) {
        BlockDefinition definition = BlockDefinition.forId(row[2]);
        assertEquals(row[18], definition.shape.name().toLowerCase(Locale.ROOT), "shape: " + row[0]);
        assertEquals(flag(row[17]), definition.solid, "solid: " + row[0]);
        assertEquals(flag(row[19]), definition.opaque, "definition opacity: " + row[0]);
        BlockState state = BlockState.of(definition, row[8], row[9], row[10], row[11], row[12], flag(row[13]));
        assertEquals(flag(row[15]), BlockGeometry.fullCube(definition, state), "full cube: " + row[0]);
        assertEquals(flag(row[16]), BlockGeometry.opaque(definition, state), "opacity: " + row[0]);
        QueryKind kind = QueryKind.valueOf(row[3].toUpperCase(Locale.ROOT));
        double[][] actual = BlockGeometry.boxes(definition, state, kind, Integer.parseInt(row[4]),
            num(row[5]), num(row[6]), num(row[7]));
        assertEquals(Integer.parseInt(row[14]), actual.length, "box count: " + row[0]);
        assertTrue(actual.length <= 9, "geometry bound: " + row[0]);
        assertTrue(cursor + actual.length <= expected.size(), "short coordinate fixture");
        // Each shape has at most nine boxes, in reference order.
        for (int i = 0; i < actual.length; i++) {
            String[] box = expected.get(cursor++);
            assertEquals(row[0], box[0], "box belongs to a different case");
            assertEquals(i, Integer.parseInt(box[1]), "missing, duplicated or reordered box");
            assertBox(box, actual[i]);
        }
        return cursor;
    }

    private static void assertBox(String[] expected, double[] actual) {
        assertEquals(6, actual.length, "AABB component count");
        // Six coordinates: min XYZ then max XYZ.
        for (int i = 0; i < 6; i++) {
            assertTrue(Double.isFinite(actual[i]), "nonfinite result");
            assertEquals(Double.doubleToRawLongBits(num(expected[i + 2])),
                Double.doubleToRawLongBits(actual[i]), "case " + expected[0] + ", box " + expected[1] + ", component " + i);
        }
    }

    private static boolean flag(String value) {
        assertTrue(value.equals("0") || value.equals("1"), "invalid boolean: " + value);
        return value.equals("1");
    }
}
