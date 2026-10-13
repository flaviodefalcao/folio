package org.folio.reader;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.nio.file.Files;
public class NeuralVoiceTest {
 @Test public void curatedModelsHavePinnedSourcesAndHashes() throws Exception {
  assertEquals("pt-BR",NeuralVoiceModels.model("faber-pt-br").language);
  for(NeuralVoiceModels.Model model:NeuralVoiceModels.MODELS){assertTrue(model.url().startsWith("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/"));assertTrue(model.sha256.matches("[a-f0-9]{64}"));assertTrue(model.bytes>60000000);}
  try{NeuralVoiceModels.model("../../private");fail();}catch(IOException expected){}
 }
 @Test public void archivePathsCannotEscapePrivateVoiceDirectory() throws Exception {
  File root=Files.createTempDirectory("folio-neural-test").toFile();
  try{
   assertTrue(NeuralVoiceModels.safeEntry(root,"model/tokens.txt").getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator));
   for(String path:new String[]{"../private","/etc/passwd","model/../../private","model\\private","bad\0name"}){
    try{NeuralVoiceModels.safeEntry(root,path);fail(path);}catch(IOException expected){}
   }
  }finally{root.delete();}
 }
 @Test public void longSpeechChunksPreserveTextAndSurrogatePairs() {
  String text="Uma leitura em português. " + "Palavras e ideias 📖 ".repeat(60);
  StringBuilder joined=new StringBuilder();int start=0;
  while(start<text.length()){int end=NeuralNarrator.chunkEnd(text,start);assertTrue(end>start);assertTrue(end-start<=320);assertFalse(Character.isHighSurrogate(text.charAt(end-1)));joined.append(text,start,end);start=end;}
  assertEquals(text,joined.toString());
 }
}
