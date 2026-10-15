import Foundation

/// Ephemeral, bounded HTTPS transport. Never logs requests, keys or signed URLs.
final class SafeHTTP: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
    let limit: Int
    let allowRedirects:Bool
    let restrictedOrigin: String?
    let allowedHosts: ((String) -> Bool)?
    private var bytes=Data(), response: HTTPURLResponse?, redirects=0
    private var continuation: CheckedContinuation<(Data,HTTPURLResponse),Error>?
    private var session: URLSession?
    init(limit: Int, allowRedirects:Bool=true, restrictedOrigin: String?=nil, allowedHosts: ((String)->Bool)?=nil) { self.limit=limit;self.allowRedirects=allowRedirects;self.restrictedOrigin=restrictedOrigin;self.allowedHosts=allowedHosts }
    static func fetch(_ request: URLRequest, limit: Int, allowRedirects:Bool=true, sameOrigin: Bool=false, allowedHosts: ((String)->Bool)?=nil) async throws -> (Data,HTTPURLResponse) {
        guard let url=request.url else { throw FolioError.message("Endereço inválido.") }
        _ = try FolioCore.https(url.absoluteString);try FolioCore.publicDNS(url)
        if let allowedHosts, !allowedHosts(url.host ?? "") { throw FolioError.message("Servidor não permitido.") }
        let transport=SafeHTTP(limit:limit,allowRedirects:allowRedirects,restrictedOrigin:sameOrigin ? FolioCore.origin(url):nil,allowedHosts:allowedHosts)
        return try await transport.start(request)
    }
    private func start(_ request: URLRequest) async throws -> (Data,HTTPURLResponse) {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation=continuation
            let config=URLSessionConfiguration.ephemeral;config.httpCookieStorage=nil;config.httpShouldSetCookies=false;config.urlCache=nil;config.timeoutIntervalForRequest=45;config.timeoutIntervalForResource=90
            let session=URLSession(configuration:config,delegate:self,delegateQueue:nil);self.session=session;session.dataTask(with:request).resume()
        }
    }
    func urlSession(_ session:URLSession, task:URLSessionTask, willPerformHTTPRedirection response:HTTPURLResponse, newRequest request:URLRequest, completionHandler:@escaping(URLRequest?)->Void) {
        if !allowRedirects { completionHandler(nil);return }
        do {
            redirects += 1;guard redirects <= 5, let url=request.url else { throw FolioError.message("Redirecionamento inválido.") }
            _ = try FolioCore.https(url.absoluteString);try FolioCore.publicDNS(url)
            if let restrictedOrigin, FolioCore.origin(url) != restrictedOrigin { throw FolioError.message("O servidor mudou de endereço; nenhuma credencial foi enviada ao redirecionamento.") }
            if let allowedHosts, !allowedHosts(url.host ?? "") { throw FolioError.message("Servidor não permitido.") }
            completionHandler(request)
        } catch { completionHandler(nil);finish(.failure(error)) }
    }
    func urlSession(_ session:URLSession, dataTask:URLSessionDataTask, didReceive response:URLResponse, completionHandler:@escaping(URLSession.ResponseDisposition)->Void) {
        guard let http=response as? HTTPURLResponse, response.expectedContentLength <= Int64(limit) else { completionHandler(.cancel);finish(.failure(FolioError.message("Arquivo excede o limite permitido.")));return };self.response=http;completionHandler(.allow)
    }
    func urlSession(_ session:URLSession, dataTask:URLSessionDataTask, didReceive data:Data) {
        if bytes.count + data.count > limit { dataTask.cancel();finish(.failure(FolioError.message("Arquivo excede o limite permitido.")));return };bytes.append(data)
    }
    func urlSession(_ session:URLSession, task:URLSessionTask, didCompleteWithError error:Error?) {
        if error != nil { finish(.failure(FolioError.message("A conexão não foi concluída."))) }
        else if let response { finish(.success((bytes,response))) }
        else { finish(.failure(FolioError.message("O servidor não respondeu."))) }
    }
    private func finish(_ result:Result<(Data,HTTPURLResponse),Error>) { guard let continuation else { return };self.continuation=nil;continuation.resume(with:result);session?.invalidateAndCancel();session=nil }
}
