package blockbyblock.core.inventory;

/** Receives stacks the inventory throws into the world (full inventory, drop key, closing with a held stack). */
@FunctionalInterface
public interface DropSink {
    void drop(ItemStack stack);
}
