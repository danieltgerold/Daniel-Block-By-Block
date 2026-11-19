package blockbyblock.core.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.golden.WorldFixture;
import blockbyblock.core.world.VoxelWorld;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class MovementParityTest {
    private static final String OLD_INPUT = "forward,right,jump,sprint,yaw,walkSpeedScale,jumpVelocity,size";
    private static final String INPUT = OLD_INPUT + ",crouch,canFly,toggleFlight,canSprint";
    private static final String OLD_STATE = "x,y,z,vx,vy,vz,fovMultiplier,speed,grounded,sprinting,jumpCount,jumpCooldown";
    private static final String STATE = OLD_STATE + ",size,crouching,eyeOffset,flying,inWater,fallDistance,landingFallDistance,damageFallDistance,landingDamageDistance";
    private static final String EDIT = "x,y,z,id,type,facing,half,stairShape,hinge,open,level,falling";

    @Test void legacyMovementMatchesEveryRecordedTick() throws IOException {
        String[] names = {"walk", "sprint", "sprint-jump", "obstacle-course", "far-flight"};
        int[] ticks = {1440, 1440, 1440, 3000, 620};
        // Exactly five historical suites, with fixed independent coverage counts.
        for (int i = 0; i < names.length; i++) {
            Path dir = GoldenCsv.dir().resolve("movement").resolve(names[i]);
            VoxelWorld world = new VoxelWorld(3);
            for (String[] edit : table(dir.resolve("edits.csv"), "x,y,z,solid", true))
                world.setBlock(num(edit[0]), num(edit[1]), num(edit[2]), flag(edit[3]));
            Player player = new Player();
            player.x = .5; player.z = .5;
            replay(names[i], dir, world, player, false, ticks[i]);
        }
    }

    @Test void currentMovementMatchesEveryRecordedTick() throws IOException {
        Path root = GoldenCsv.dir().resolve("current/movement");
        List<Path> suites;
        try (var paths = Files.list(root)) { suites = paths.filter(Files::isDirectory).sorted().toList(); }
        assertEquals(10, suites.size(), "current scenario coverage changed");
        // Finite directory table; each fixture records its independent tick count.
        for (Path dir : suites) {
            List<String[]> configs = table(dir.resolve("fixture.csv"), "baseY,layers,x,y,z,ticks", false);
            assertEquals(1, configs.size(), "exactly one initial world/player configuration");
            String[] config = configs.getFirst();
            VoxelWorld world = new VoxelWorld(num(config[0]), config[1].split("\\|"));
            for (String[] edit : table(dir.resolve("edits.csv"), EDIT, true)) WorldFixture.loadEdit(world, edit, 0);
            Player player = new Player();
            player.x = num(config[2]); player.y = num(config[3]); player.z = num(config[4]);
            replay(dir.getFileName().toString(), dir, world, player, true, Integer.parseInt(config[5]));
        }
    }

    private static void replay(String name, Path dir, VoxelWorld world, Player player,
                               boolean current, int ticks) throws IOException {
        List<String[]> inputs = table(dir.resolve("inputs.csv"), current ? INPUT : OLD_INPUT, false);
        List<String[]> expected = table(dir.resolve("expected.csv"), current ? STATE : OLD_STATE, false);
        assertTrue(ticks > 0, "nonpositive tick count");
        assertEquals(ticks, inputs.size(), name + ": short inputs");
        assertEquals(ticks, expected.size(), name + ": short expected states");
        String[] fields = (current ? STATE : OLD_STATE).split(",");
        // Tick count is fixed by the scenario, never by the shorter file.
        for (int tick = 0; tick < ticks; tick++) {
            String[] row = inputs.get(tick);
            player.size = num(row[7]);
            Movement.step(player, input(row, current), world);
            double[] actual = state(player);
            for (int field = 0; field < fields.length; field++)
                assertEquals(Double.doubleToRawLongBits(num(expected.get(tick)[field])),
                    Double.doubleToRawLongBits(actual[field]),
                    name + " tick " + tick + " field " + fields[field] + ": expected "
                        + expected.get(tick)[field] + " actual " + actual[field]);
        }
    }

    private static PlayerInput input(String[] row, boolean current) {
        PlayerInput in = new PlayerInput();
        in.forward = num(row[0]); in.right = num(row[1]);
        in.jump = flag(row[2]); in.sprint = flag(row[3]); in.yaw = num(row[4]);
        in.walkSpeedScale = row[5].isEmpty() ? Double.NaN : num(row[5]);
        in.jumpVelocity = row[6].isEmpty() ? Double.NaN : num(row[6]);
        if (current) {
            in.crouch = flag(row[8]); in.canFly = flag(row[9]);
            in.toggleFlight = flag(row[10]); in.canSprint = flag(row[11]);
        }
        return in;
    }

    public static double[] state(Player p) {
        return new double[] {p.x, p.y, p.z, p.vx, p.vy, p.vz, p.fovMultiplier, p.speed,
            p.grounded ? 1 : 0, p.sprinting ? 1 : 0, p.jumpCount, p.jumpCooldown,
            p.size, p.crouching ? 1 : 0, p.eyeOffset, p.flying ? 1 : 0, p.inWater ? 1 : 0,
            p.fallDistance, p.landingFallDistance, p.damageFallDistance, p.landingDamageDistance};
    }

    private static List<String[]> table(Path path, String header, boolean allowEmpty) throws IOException {
        try (var lines = Files.lines(path)) { assertEquals(header, lines.findFirst().orElseThrow(), path.toString()); }
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(allowEmpty || !rows.isEmpty(), "empty fixture: " + path);
        int width = header.split(",").length;
        // Bounded by the finite fixture file's rows.
        for (String[] row : rows) assertEquals(width, row.length, "malformed row: " + path);
        return rows;
    }

    private static boolean flag(String value) {
        assertTrue(value.equals("0") || value.equals("1"), "invalid boolean: " + value);
        return value.equals("1");
    }

    private static double num(String value) { return Double.parseDouble(value); }
}
