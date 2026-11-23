package blockbyblock.core.world;

import blockbyblock.core.inventory.ItemStack;
import blockbyblock.core.world.shape.BlockState;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Port of FallingBlocks (src/falling-blocks.js): sand and gravel with nothing under them turn into falling
 * entities two ticks after the world last changed around them, fall under gravity, stack on each other, and settle
 * back into a block (or drop as an item when the cell is taken or a player stands in it). A block exists either in
 * its cell, as an entity, or as one dropped item, never two.
 *
 * <p>Attach it to a {@link WorldRules}; edits schedule blocks through the rules' settled hook, and the owner calls
 * {@link #tick()} once per game tick (after fluids, before furnaces, as the world step does).
 */
public final class FallingBlocks implements WorldRules.ChangeListener {
    /** A block that has left its cell and is falling. */
    public static final class Entity {
        public final int serial;
        public final String id;
        public final BlockState state;
        public double x, y, z, vy;
        public int age;

        Entity(int serial, String id, BlockState state, double x, double y, double z) {
            this.serial = serial;
            this.id = id;
            this.state = state;
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    private static final class Pending {
        final double x, y, z;
        final long due;

        Pending(double x, double y, double z, long due) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.due = due;
        }
    }

    private final WorldRules rules;
    private final Map<String, Pending> pending = new LinkedHashMap<>(); // insertion order is the check order
    private List<Entity> entities = new ArrayList<>();
    private Supplier<List<BlockActions.Body>> players = () -> List.of();
    private long time;
    private int serial;

    public FallingBlocks(WorldRules rules) {
        this.rules = rules;
        rules.addListener(this);
    }

    /** Where players are, so a block does not settle inside one. */
    public void setPlayers(Supplier<List<BlockActions.Body>> players) { this.players = players; }

    public long time() { return time; }
    public int serial() { return serial; }
    public List<Entity> entities() { return entities; }
    public int pendingCount() { return pending.size(); }

    /** Pending checks as {@code x:y:z@due}, in check order. */
    public String pendingText() {
        StringBuilder text = new StringBuilder();
        for (Pending p : pending.values()) text.append(text.length() == 0 ? "" : ";").append((long) p.x).append(':').append((long) p.y).append(':').append((long) p.z).append('@').append(p.due);
        return text.length() == 0 ? "-" : text.toString();
    }

    @Override public void settled(double x, double y, double z) {
        schedule(x, y, z);
        schedule(x, y + 1, z);
    }

    private void schedule(double x, double y, double z) {
        WorldBlock block = rules.world().storage().blockAt(x, y, z);
        if (block == null || !block.definition.falling) return;
        String key = x + "," + y + "," + z;
        if (!pending.containsKey(key)) pending.put(key, new Pending(x, y, z, time + 2));
    }

    private boolean supported(double x, double y, double z) {
        return rules.world().hasSolidInBox(new double[] {x + .001, y - 1e-6, z + .001}, new double[] {x + .999, y, z + .999});
    }

    /** One game tick. */
    public void tick() {
        time++;
        // Checks added while this runs are not due until a later tick, so a snapshot visits the same ones the JS map does.
        for (Map.Entry<String, Pending> entry : new ArrayList<>(pending.entrySet())) {
            Pending at = entry.getValue();
            if (at.due > time) continue;
            pending.remove(entry.getKey());
            WorldBlock block = rules.world().storage().blockAt(at.x, at.y, at.z);
            if (block == null || !block.definition.falling || supported(at.x, at.y, at.z)) continue;
            Entity entity = new Entity(++serial, block.id, block.state, at.x + .5, at.y, at.z + .5);
            rules.setBlock(at.x, at.y, at.z, null);
            entities.add(entity);
        }
        // Lower entities settle first, so the next block in a stack lands on the one below without overlapping it.
        List<Entity> ordered = new ArrayList<>(entities);
        ordered.sort((a, b) -> a.y != b.y ? Double.compare(a.y, b.y) : Integer.compare(a.serial, b.serial));
        List<Entity> alive = new ArrayList<>();
        Map<String, Entity> columns = new LinkedHashMap<>();
        for (Entity e : ordered) {
            e.age++;
            e.vy -= .04;
            VoxelWorld.Motion motion = rules.world().moveRaw(e.x, e.y, e.z, 0, e.vy, 0, .5, 1);
            String column = e.x + "," + e.z;
            Entity lower = columns.get(column);
            boolean onEntity = lower != null && e.y >= lower.y + 1 - 1e-7 && motion.y < lower.y + 1;
            double newY = onEntity ? lower.y + 1 : motion.y;
            e.y = newY;
            e.vy *= .98;
            if (!onEntity && motion.blockedY) {
                settle(e);
                continue;
            }
            if (e.age >= 600) {
                drop(e);
                continue;
            }
            if (onEntity) e.vy = Math.max(e.vy, lower.vy);
            alive.add(e);
            columns.put(column, e);
        }
        entities = alive;
    }

    private void drop(Entity e) { rules.emitDrop(new ItemStack(e.id, 1), e.x, e.y, e.z); }

    private void settle(Entity e) {
        double x = Math.floor(e.x), y = Math.floor(e.y + 1e-7), z = Math.floor(e.z);
        double[] min = {x, y, z}, max = {x + 1, y + 1, z + 1};
        if (!BlockActions.canPlaceBlock(rules, x, y, z, players.get(), e.id, e.state) || rules.world().hasSolidInBox(min, max)) {
            drop(e);
            return;
        }
        if (!rules.setBlock(x, y, z, e.id, e.state)) drop(e);
    }
}
