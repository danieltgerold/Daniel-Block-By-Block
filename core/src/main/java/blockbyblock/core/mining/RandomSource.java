package blockbyblock.core.mining;

/**
 * A source of numbers in [0, 1). The JS uses Math.random, which is not reproducible; the core takes the source as an
 * argument so a server can supply a seeded one and tests can supply fixed values.
 */
@FunctionalInterface
public interface RandomSource {
    double next();
}
