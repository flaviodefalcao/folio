package org.folio.reader;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;

/** Short-lived, read-only OPDS server. No app preferences or arbitrary paths are exposed. */
final class KindleShare implements Closeable {
    static final class Book {
        final String id, title, author;
        final File file;
        Book(String id, String title, String author, File file) {
            this.id=id; this.title=title; this.author=author; this.file=file;
        }
    }
    private final ServerSocket server;
    private final List<Book> books;
    private final String token, origin;
    private final Timer expiryTimer=new Timer("Folio Kindle expiry",true);
    private volatile boolean closed;
    private volatile Socket active;
    private int denied;
    private final long expires=System.currentTimeMillis()+15*60*1000L;
    KindleShare(InetAddress address, List<Book> books) throws IOException {
        this.books=Collections.unmodifiableList(new ArrayList<>(books));
        token=Integer.toString(10000000+new SecureRandom().nextInt(90000000));
        server=new ServerSocket(); server.bind(new InetSocketAddress(address,0)); server.setSoTimeout(1000);
        origin="http://"+address.getHostAddress()+":"+server.getLocalPort();
        expiryTimer.schedule(new TimerTask() { @Override public void run() { close(); } },15*60*1000L);
        Thread thread=new Thread(this::serve,"Folio Kindle OPDS"); thread.setDaemon(true); thread.start();
    }
    String url() { return origin+"/"+token+"/opds"; }
    long expiresAt() { return expires; }
    boolean running() { return !closed && System.currentTimeMillis()<expires; }
    private void serve() {
        try {
            while(running()) {
                try(Socket socket=server.accept()) {
                    active=socket; socket.setSoTimeout(5000);
                    if(!socket.getInetAddress().isSiteLocalAddress() && !socket.getInetAddress().isLoopbackAddress()) continue;
                    handle(socket);
                } catch(SocketTimeoutException ignored) {} catch(IOException ignored) { if(closed) break; }
                finally { active=null; }
            }
        } finally { close(); }
    }
    private void handle(Socket socket) throws IOException {
        InputStream input=socket.getInputStream(); ByteArrayOutputStream header=new ByteArrayOutputStream();
        int value; boolean complete=false;
        while(header.size()<8192 && (value=input.read())!=-1) {
            header.write(value); byte[] data=header.toByteArray(); int n=data.length;
            if(n>=4 && data[n-4]==13 && data[n-3]==10 && data[n-2]==13 && data[n-1]==10) { complete=true;break; }
        }
        if(!complete) { respond(socket,400,"text/plain",new byte[0],null);return; }
        String[] first=header.toString("US-ASCII").split("\r\n",2)[0].split(" ");
        if(first.length!=3 || !first[0].equals("GET")) { respond(socket,405,"text/plain",new byte[0],null);return; }
        String path=first[1], prefix="/"+token+"/";
        if(!path.startsWith(prefix)) { respond(socket,403,"text/plain",new byte[0],null);if(++denied>=10) close();return; }
        if(path.equals(prefix+"opds")) { respond(socket,200,"application/atom+xml;profile=opds-catalog;kind=acquisition",feed().getBytes(StandardCharsets.UTF_8),null);return; }
        for(Book book:books) if(path.equals(prefix+"book/"+book.id)) {
            respond(socket,200,"application/epub+zip",null,book.file);return;
        }
        respond(socket,404,"text/plain",new byte[0],null);
    }
    static String escape(String value) {
        return value.replaceAll("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]", "")
            .replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");
    }
    private String feed() {
        java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'",Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        String updated=format.format(new Date());
        StringBuilder xml=new StringBuilder("<?xml version=\"1.0\" encoding=\"utf-8\"?><feed xmlns=\"http://www.w3.org/2005/Atom\"><id>urn:folio:kindle</id><title>Folio — celular</title><updated>"+updated+"</updated><link rel=\"self\" type=\"application/atom+xml;profile=opds-catalog;kind=acquisition\" href=\""+url()+"\"/>");
        for(Book book:books) xml.append("<entry><id>urn:folio:").append(book.id).append("</id><title>").append(escape(book.title)).append("</title><author><name>").append(escape(book.author)).append("</name></author><updated>").append(updated).append("</updated><link rel=\"http://opds-spec.org/acquisition\" type=\"application/epub+zip\" title=\"Baixar EPUB\" href=\"").append(origin).append("/").append(token).append("/book/").append(book.id).append("\"/></entry>");
        return xml.append("</feed>").toString();
    }
    private void respond(Socket socket,int status,String type,byte[] data,File file) throws IOException {
        long length=file==null?data.length:file.length(); OutputStream out=socket.getOutputStream();
        String headers="HTTP/1.1 "+status+" "+(status==200?"OK":"Error")+"\r\nContent-Type: "+type+"\r\nContent-Length: "+length+"\r\nCache-Control: no-store\r\nConnection: close\r\n";
        if(file!=null) headers+="Content-Disposition: attachment; filename=\""+file.getName()+"\"\r\n";
        out.write((headers+"\r\n").getBytes(StandardCharsets.US_ASCII));
        if(file==null) out.write(data);
        else try(InputStream in=new FileInputStream(file)) { byte[] buffer=new byte[65536];int n;while(running() && (n=in.read(buffer))!=-1) out.write(buffer,0,n); }
        out.flush();
    }
    @Override public void close() {
        closed=true;expiryTimer.cancel();try {server.close();}catch(IOException ignored) {}
        Socket socket=active;if(socket!=null) try {socket.close();}catch(IOException ignored) {}
    }
}
