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
</web-app>
`;

fs.writeFileSync(webXmlPath, webXmlContent);

console.log('web.xml generado correctamente.');

// Renombrar pdf.worker.min.mjs a .js para evitar el bloqueo MIME en WebLogic
const mjsPath = path.join(distDir, 'pdf.worker.min.mjs');
const jsPath = path.join(distDir, 'pdf.worker.min.js');
if (fs.existsSync(mjsPath)) {
    fs.renameSync(mjsPath, jsPath);
    console.log('Renombrado pdf.worker.min.mjs a .js');
}

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
