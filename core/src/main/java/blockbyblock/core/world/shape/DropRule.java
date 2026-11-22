package blockbyblock.core.world.shape;

/** How a block decides what it drops; the numbers live on the definition. */
public enum DropRule {
    /** One of the block itself. */
    SELF,
    /** A fixed item and count; a null item means nothing drops. */
    LIST,
    /** One of itself, or two when it is a double slab. */
    SLAB,
    /** The item with a count from dropCount to dropMax inclusive, chosen by a random source. */
    RANGE
}
