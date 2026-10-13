package org.folio.reader;
import org.junit.Test;
import org.json.JSONObject;
import static org.junit.Assert.*;
public class KindleOffsetTest {
    @Test public void firstBlockParsedAsJsonIntegerIsAccepted() throws Exception {
        Object offset=new JSONObject("{\"offset\":0}").get("offset");
        assertTrue(offset instanceof Integer);
        assertEquals(0L,FolioPlugin.kindleOffset(offset));
    }
    @Test public void subsequentBlocksAndFinalPartialOffsetAreAccepted() throws Exception {
        assertEquals(196608L,FolioPlugin.kindleOffset(new JSONObject("{\"offset\":196608}").get("offset")));
        assertEquals(393216L,FolioPlugin.kindleOffset(393216L));
        assertEquals(196608L,FolioPlugin.kindleOffset(196608.0));
    }
    @Test public void invalidOffsetsAreRejected() {
        for(Object value:new Object[]{null,"0",-1,0.5,Double.NaN,Double.POSITIVE_INFINITY,41943041L})
            assertEquals(-1L,FolioPlugin.kindleOffset(value));
    }
}
