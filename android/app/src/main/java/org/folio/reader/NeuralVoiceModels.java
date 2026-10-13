package org.folio.reader;

import android.content.Context;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.TimeUnit;
import okhttp3.*;
import org.apache.commons.compress.archivers.tar.*;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

final class NeuralVoiceModels {
    static final class Model {
        final String id,name,language,archive,sha256; final long bytes;
        Model(String id,String name,String language,String archive,String hash,long bytes) {
            this.id=id;this.name=name;this.language=language;this.archive=archive;this.sha256=hash;this.bytes=bytes;
        }
        String url() {return "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/"+archive+".tar.bz2";}
    }
    static final Model[] MODELS={
        new Model("faber-pt-br","Faber · português do Brasil","pt-BR","vits-piper-pt_BR-faber-medium","7add3f923ad6bc25ca8a192805fd1a64d1b3893e4611c4a9719545a825039a83",67183065L),
        new Model("lessac-en-us","Lessac · inglês americano","en-US","vits-piper-en_US-lessac-medium","9e3febfacf0abf4270172d2958bcec246032b7e88efc2720840cc80c93de334e",67230653L)
    };
    interface Progress {void update(int percent);}
    private final File root;
    NeuralVoiceModels(Context context) {root=new File(context.getFilesDir(),"neural-voices");}
    static Model model(String id) throws IOException {
        for(Model m:MODELS)if(m.id.equals(id))return m;
        throw new IOException("Voz neural desconhecida.");
    }
    File folder(Model model) {return new File(root,model.id);}
    boolean installed(Model model) {
        File dir=folder(model);return new File(dir,"verified").isFile() && new File(dir,model.archive+"/tokens.txt").isFile() && modelFile(model)!=null;
    }
    File modelFile(Model model) {
        File[] files=new File(folder(model),model.archive).listFiles((dir,name)->name.endsWith(".onnx"));
        return files!=null && files.length==1?files[0]:null;
    }
    synchronized void download(Model model,Progress progress) throws Exception {
        if(installed(model))return;
        if(!root.exists() && !root.mkdirs())throw new IOException("Não foi possível criar a pasta de vozes.");
        if(root.getUsableSpace()<300L*1024*1024)throw new IOException("Libere pelo menos 300 MB no celular para instalar a voz.");
        File[] old=root.listFiles();if(old!=null)for(File file:old)if(file.getName().startsWith("staging-"))delete(file);
        File staging=new File(root,"staging-"+UUID.randomUUID());if(!staging.mkdir())throw new IOException("Não foi possível preparar o download.");
        File archive=new File(staging,"voice.tar.bz2");
        try {
            OkHttpClient client=FolioPlugin.publicClient().newBuilder().callTimeout(10,TimeUnit.MINUTES).build();
            HttpUrl url=HttpUrl.get(model.url());Response response=null;
            try {
                for(int redirects=0;redirects<6;redirects++) {
                    response=client.newCall(new Request.Builder().url(url).build()).execute();
                    if(response.code()<300 || response.code()>=400)break;
                    String location=response.header("Location");response.close();response=null;
                    HttpUrl next=location==null?null:url.resolve(location);
                    if(next==null || !next.isHttps() || !(next.host().equals("github.com") || next.host().equals("release-assets.githubusercontent.com")))throw new IOException("Redirecionamento de modelo não permitido.");
                    url=next;
                }
                if(response==null || !response.isSuccessful() || response.body()==null)throw new IOException("Não foi possível baixar a voz. Tente novamente no Wi-Fi.");
                MessageDigest digest=MessageDigest.getInstance("SHA-256");long count=0;int last=-1;
                try(InputStream in=response.body().byteStream();OutputStream out=new FileOutputStream(archive)) {
                    byte[] buffer=new byte[65536];int n;
                    while((n=in.read(buffer))!=-1) {
                        count+=n;if(count>model.bytes)throw new IOException("Arquivo de voz maior que o esperado.");
                        digest.update(buffer,0,n);out.write(buffer,0,n);
                        int percent=(int)(count*90/model.bytes);if(percent!=last){progress.update(percent);last=percent;}
                    }
                }
                if(count!=model.bytes || !model.sha256.equals(hex(digest.digest())))throw new IOException("Falha na verificação da voz; o arquivo foi descartado.");
            } finally {if(response!=null)response.close();client.dispatcher().executorService().shutdown();}
            File payload=new File(staging,"payload");payload.mkdir();
            try(TarArchiveInputStream tar=new TarArchiveInputStream(new BZip2CompressorInputStream(new FileInputStream(archive)))) {
                TarArchiveEntry entry;long expanded=0;int entries=0;
                while((entry=tar.getNextTarEntry())!=null) {
                    if(++entries>5000)throw new IOException("Modelo contém arquivos demais.");
                    File target=safeEntry(payload,entry.getName());
                    if(!entry.getName().equals(model.archive) && !entry.getName().startsWith(model.archive+"/"))throw new IOException("Pasta de modelo inesperada.");
                    if(entry.isDirectory()){target.mkdirs();continue;}
                    if(!entry.isFile() || entry.isSymbolicLink() || entry.isLink())throw new IOException("Tipo de arquivo não permitido no modelo.");
                    expanded+=entry.getSize();if(expanded>300L*1024*1024)throw new IOException("Modelo expandido muito grande.");
                    target.getParentFile().mkdirs();try(OutputStream out=new FileOutputStream(target)){byte[] buffer=new byte[65536];int n;while((n=tar.read(buffer))!=-1)out.write(buffer,0,n);}
                }
            }
            File[] models=new File(payload,model.archive).listFiles((dir,name)->name.endsWith(".onnx"));
            if(models==null || models.length!=1 || !new File(payload,model.archive+"/tokens.txt").isFile() || !new File(payload,model.archive+"/espeak-ng-data").isDirectory())throw new IOException("Modelo incompleto.");
            try(OutputStream out=new FileOutputStream(new File(payload,"verified"))){out.write(model.sha256.getBytes(java.nio.charset.StandardCharsets.US_ASCII));}
            File destination=folder(model);if(destination.exists())delete(destination);
            if(!payload.renameTo(destination))throw new IOException("Não foi possível concluir a instalação.");
            progress.update(100);
        } finally {delete(staging);}
    }
    static File safeEntry(File root,String name) throws IOException {
        if(name.startsWith("/") || name.contains("\\") || name.indexOf('\0')>=0)throw new IOException("Caminho inválido no modelo.");
        File target=new File(root,name);
        if(!target.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException("Caminho fora da pasta de instalação.");
        return target;
    }
    static String hex(byte[] bytes) {StringBuilder text=new StringBuilder();for(byte b:bytes)text.append(String.format(Locale.ROOT,"%02x",b&255));return text.toString();}
    private static void delete(File file) {File[] children=file.listFiles();if(children!=null)for(File child:children)delete(child);file.delete();}
}
