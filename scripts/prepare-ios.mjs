import {readFileSync,writeFileSync} from 'node:fs';
const path='ios/App/CapApp-SPM/Package.swift';let source=readFileSync(path,'utf8');
if(!source.includes('name: "FolioNative"')){
 source=source.replace('dependencies: [\n','dependencies: [\n        .package(name: "FolioNative", path: "../../FolioNative"),\n');
 source=source.replace('.product(name: "Capacitor", package: "capacitor-swift-pm"),','.product(name: "FolioNative", package: "FolioNative"),\n                .product(name: "Capacitor", package: "capacitor-swift-pm"),');
 writeFileSync(path,source);
}
