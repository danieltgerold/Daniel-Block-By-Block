package blockbyblock.core.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;

import blockbyblock.core.text.JsNumbers;
import org.junit.jupiter.api.Test;

/** Number printing must match JS String(x) and String(Number(x.toPrecision(8))) for every recorded double. */
class JsNumbersParityTest {
    @Test void printsLikeJs() throws Exception {
        for (String[] r : PlayerNamesParityTest.tsv("numbers.tsv", "bits\tstring\tnumberText", 1099)) {
            double v = Double.longBitsToDouble(Long.parseUnsignedLong(r[0], 16));
            assertEquals(r[1], JsNumbers.toString(v), "String(x) for bits " + r[0]);
            assertEquals(r[2], JsNumbers.numberText(v), "numberText for bits " + r[0] + " (" + r[1] + ")");
        }
    }
}
