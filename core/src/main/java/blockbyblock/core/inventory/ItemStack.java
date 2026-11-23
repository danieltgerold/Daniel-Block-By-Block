package blockbyblock.core.inventory;

/**
 * A stack of one item. Mutable like the JS stacks it mirrors; the only fields the rules use are the
 * item id, the count and the tool damage. Two stacks stack together when id and damage agree.
 */
public final class ItemStack {
    public String id;
    public long count;
    /** Wear on a tool; 0 for everything else. A missing JS value reads as 0. */
    public int damage;

    public ItemStack(String id, long count) { this(id, count, 0); }

    public ItemStack(String id, long count, int damage) {
        this.id = id;
        this.count = count;
        this.damage = damage;
    }

    public ItemStack copy() { return new ItemStack(id, count, damage); }

    public ItemStack copyWithCount(long newCount) { return new ItemStack(id, newCount, damage); }

    /** JS sameStack: both present, same id and same damage. */
    public static boolean same(ItemStack a, ItemStack b) {
        return a != null && b != null && a.id.equals(b.id) && a.damage == b.damage;
    }

    public static ItemStack copyOf(ItemStack stack) { return stack == null ? null : stack.copy(); }

    /** Canonical text, identical to the golden traces: id x count, plus d<damage> only when worn. */
    @Override public String toString() { return id + "x" + count + (damage != 0 ? "d" + damage : ""); }
}
