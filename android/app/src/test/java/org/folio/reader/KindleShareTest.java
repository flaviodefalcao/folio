package org.folio.reader;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collections;
import javax.xml.parsers.DocumentBuilderFactory;

public class KindleShareTest {
    private String request(String url,String method) throws Exception {
        URI uri=new URI(url);
        try(Socket socket=new Socket(uri.getHost(),uri.getPort())) {
            socket.setSoTimeout(3000);
            socket.getOutputStream().write((method+" "+uri.getRawPath()+" HTTP/1.1\r\nHost: localhost\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;
            while((n=socket.getInputStream().read(buffer))!=-1)out.write(buffer,0,n);
            return out.toString("UTF-8");
        }
    }
    @Test public void onlyAuthorizedCatalogAndSelectedBookAreServed() throws Exception {
        File file=File.createTempFile("folio-test-", ".epub");
        try {
            Files.write(file.toPath(),"test-epub-data".getBytes(StandardCharsets.UTF_8));
            try(KindleShare share=new KindleShare(InetAddress.getLoopbackAddress(),Collections.singletonList(new KindleShare.Book("abc","A & <B>","Autor",file)))) {
                String response=request(share.url(),"GET");assertTrue(response.startsWith("HTTP/1.1 200"));
                String xml=response.split("\r\n\r\n",2)[1];
                assertTrue(xml.contains("A &amp; &lt;B&gt;"));
                DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
                assertTrue(request(share.url().replace("/opds","/book/abc"),"GET").endsWith("test-epub-data"));
                assertTrue(request(share.url().replace("/opds","/book/../../settings"),"GET").startsWith("HTTP/1.1 404"));
                assertTrue(request(share.url().replace("/opds","/other"),"GET").startsWith("HTTP/1.1 404"));
                assertTrue(request(share.url(),"POST").startsWith("HTTP/1.1 405"));
                URI uri=new URI(share.url());
                assertTrue(request("http://"+uri.getHost()+":"+uri.getPort()+"/wrong/opds","GET").startsWith("HTTP/1.1 403"));
            }
        } finally { file.delete(); }
    }
    @Test public void newSessionRotatesAccessAndStopClosesListener() throws Exception {
        KindleShare one=new KindleShare(InetAddress.getLoopbackAddress(),Collections.emptyList());
        KindleShare two=new KindleShare(InetAddress.getLoopbackAddress(),Collections.emptyList());
        assertNotEquals(new URI(one.url()).getPath(),new URI(two.url()).getPath());
        one.close();assertFalse(one.running());
        try {request(one.url(),"GET");fail("Listener should be closed");}catch(IOException expected) {}
        two.close();
    }
    @Test public void guessingAccessCodeClosesSessionAfterTenAttempts() throws Exception {
        try(KindleShare share=new KindleShare(InetAddress.getLoopbackAddress(),Collections.emptyList())) {
            URI uri=new URI(share.url());
            String wrong="http://"+uri.getHost()+":"+uri.getPort()+"/wrong/opds";
            for(int i=0;i<10;i++) assertTrue(request(wrong,"GET").startsWith("HTTP/1.1 403"));
            for(int i=0;i<20 && share.running();i++) Thread.sleep(10);
            assertFalse(share.running());
        }
    }
}
