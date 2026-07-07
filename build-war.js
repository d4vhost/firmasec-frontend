const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, 'dist', 'firmaec-frontend', 'browser');
const webInfDir = path.join(distDir, 'WEB-INF');
const webXmlPath = path.join(webInfDir, 'web.xml');
const targetWarPath = path.join(__dirname, 'dist', 'firmaeeasa.war');

// Crear directorio WEB-INF
if (!fs.existsSync(webInfDir)) {
    fs.mkdirSync(webInfDir, { recursive: true });
}

// Crear web.xml para SPA routing en WebLogic
const webXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee http://xmlns.jcp.org/xml/ns/javaee/web-app_3_1.xsd"
         version="3.1">
    
    <display-name>firmaeeasa</display-name>

    <error-page>
        <error-code>404</error-code>
        <location>/index.html</location>
    </error-page>
    
    <mime-mapping>
        <extension>mjs</extension>
        <mime-type>application/javascript</mime-type>
    </mime-mapping>
    <mime-mapping>
        <extension>woff2</extension>
        <mime-type>font/woff2</mime-type>
    </mime-mapping>
    <mime-mapping>
        <extension>woff</extension>
        <mime-type>font/woff</mime-type>
    </mime-mapping>
    <mime-mapping>
        <extension>ttf</extension>
        <mime-type>font/ttf</mime-type>
    </mime-mapping>
    <mime-mapping>
        <extension>wasm</extension>
        <mime-type>application/wasm</mime-type>
    </mime-mapping>
</web-app>
`;

fs.writeFileSync(webXmlPath, webXmlContent);
console.log('web.xml generado correctamente.');

// Copiar pdf.worker.min.mjs directamente a la raiz del dist
// Asi evitamos rutas largas dentro del WAR que bloquean WebLogic en Windows
const workerSrc = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const workerDest = path.join(distDir, 'pdf.worker.min.js');
if (fs.existsSync(workerSrc)) {
    let workerContent = fs.readFileSync(workerSrc, 'utf8');
    // PARCHE: PDF.js tiene un bug donde concatena `null` con el nombre del archivo si wasmUrl no esta definido.
    workerContent = workerContent.replace(/`\$\{WasmImage\.#I\}\$\{this\._noWasmFilename\}`/g, '`${WasmImage.#I||\'\'}${this._noWasmFilename}`');
    workerContent = workerContent.replace(/`\$\{WasmImage\.#I\}\$\{this\._filename\}`/g, '`${WasmImage.#I||\'\'}${this._filename}`');
    fs.writeFileSync(workerDest, workerContent);
    console.log('pdf.worker.min.js copiado (y parchado) correctamente a la raiz.');
} else {
    console.warn('ADVERTENCIA: No se encontro pdf.worker.min.mjs en node_modules');
}

// Copiar archivos WASM de JBIG2 a la raiz
// El worker intenta importarlos de forma relativa a su ubicacion
const wasmDir = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'wasm');
const jbig2Files = ['jbig2.wasm', 'jbig2_nowasm_fallback.js'];
jbig2Files.forEach(fileName => {
    const src = path.join(wasmDir, fileName);
    const dest = path.join(distDir, fileName);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`${fileName} copiado correctamente a la raiz.`);
    } else {
        console.warn(`ADVERTENCIA: No se encontro ${fileName}`);
    }
});

// Empaquetar a WAR usando PowerShell Compress-Archive
try {
    if (fs.existsSync(targetWarPath)) {
        fs.unlinkSync(targetWarPath);
    }
    const tempZip = path.join(__dirname, 'dist', 'firmaeeasa_temp.zip');
    if (fs.existsSync(tempZip)) {
        fs.unlinkSync(tempZip);
    }
    
    console.log('Comprimiendo archivos...');
    execSync(`powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${tempZip}' -Force"`, { stdio: 'inherit' });
    
    console.log('Renombrando a .war...');
    fs.renameSync(tempZip, targetWarPath);
    
    console.log(`WAR generado con exito en: ${targetWarPath}`);
} catch (err) {
    console.error('Error al empaquetar el WAR:', err.message);
    process.exit(1);
}
