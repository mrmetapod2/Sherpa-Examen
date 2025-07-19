// librerias utilizadas
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const downloadsPath = path.resolve(__dirname, 'downloads');

//esta funcion es para reintentar descargar cuando hay un error en el servidor
async function tryDownload(page, downloadButton, retries = 20 , delay =1000) {//tiene 20 intentos y 1000ms de espera, se puede modificar
  for (let attempt = 1; attempt <= retries; attempt++) {//por cada intento
    try {
      // intenta descargar
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: delay * 2 }), // espera un poco mas que el delay
        downloadButton.click()
      ]);

      return download; // si funciono bien se retorna descargas
    } catch (err) {
      if (attempt === retries) throw new Error(`❌ Failed to trigger download after ${retries} attempts`); //manejo de errores
      console.warn(`⚠️ Download not triggered (attempt ${attempt}). Retrying in ${delay}ms...`);
      await page.waitForTimeout(delay);
    }
  }
}
//implementacion de la busqueda binaria


//esta funcion es para extraer el password de la API
function extractPassword(responseData) {
   const { targets, vault } = responseData.challenge;// se toman los datos del challange
  let password = ''; // se crea una variable para la contraseña
  
  for (const target of targets) {// un loop por cada elemento
    let low = 0, high = vault.length - 1; //se inicializan las variables
    while (low <= high) {
        
        const mid = Math.floor((low + high) / 2); //se busca la mitad de la lista
        
        if (mid === target) {password += vault[mid]}; // si es el target se añade el valor al que corresponde en la lista
        if (mid < target) low = mid + 1; // si es mas chico entonces todo lo mas bajo que el target es elminiado
        else high = mid - 1; // y si es mas alto entonces hace que high tome el valor de mid (-1 porque se sabe que mid no es target)
    }
    
  }

  return password;//se retorna la contraseña
}

async function extractCodigoFromPDF(filePath) {//extraer codigo del pdf
  for (let attempt = 1; attempt <= 50; attempt++) {// hay una cantidad de intentos maximos normalmente  no es necesario mas que 
    try {
      const dataBuffer = fs.readFileSync(filePath); //se abre el archivo
      const data = await pdfParse(dataBuffer); // se realiza un parse de la data
      const fullText = data.text; //se toma solo el texto

      const match = fullText.match(/Cˆ‡digo de acceso:\s*(\S+)/i);// y se hace match con la manera de conseguir el codigo
      if (!match) throw new Error(`No se encontró el código en el PDF`); // si no se encentra tira un error y se reintenta
      console.log(match[1]);
      return match[1]; // se retorna el codigo si fue encontrado
    } catch (err) {
      console.error(`Attempt ${attempt}: Failed to parse PDF -`, err.message); //y si pdfParse no comprende el archivo se tira otro error y se intenta de vuelta
      if (attempt === 50) throw err; // si nada funciona se tira un error completo al final
      await new Promise(r => setTimeout(r, 500)); 
    }
  }
}


function romanize(num) { //codigo para numeros romanos para moverse atravez de selection bar de los siglos
  var lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1},roman = '',i; //todos los posibles valores y numeros romanos
  for ( i in lookup ) { // por cada numero en la lista
    while ( num >= lookup[i] ) { // si es mas grande
      roman += i;// se añade el nro romano a al final
      num -= lookup[i]; // y se resta del mismo valor de el numero base
    }
  }
  return roman; //se retorna el numero romano de lo creado
}

async function iniciarAventura() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Navegar a la cripta
  await page.goto('https://pruebatecnica-sherpa-production.up.railway.app/login');
  //se añade el email y contraseña pedidos por el examen
  await page.fill('#email', 'monje@sherpa.local');
  await page.fill('#password', 'cript@123');
  await page.click('button[type="submit"]');

  let codigo = "";// se inicializa la variable del codigo de desbloqueo

   for (let i = 0; i < 5; i++) { //por cada uno de los libros
    const roman = romanize(14 + i); //se toma el valor romano del mismo
    const selector = `div.relative:nth-of-type(1) select`; //se encuentra el selector de siglos
    
   
    await page.waitForSelector(selector);
    await page.selectOption(selector, { label: roman });  // y se elige el valor del siglo del tomo actual

    

    if (i>0){//si no es el primer tomo (porque ya esta desbloqueado)
        
      if (i>2){// y si es de los dos ultimos tomos
        
        const bookTitle = await page.locator('h3.text-lg').innerText(); // se toma el titulo del libro
        
        const documentationBtn = page.locator('button:has-text("Ver Documentación")');//  se observa la documentacion
        await documentationBtn.waitFor();
        await documentationBtn.click();

        
        const linkLocator = page.locator('pre.text-green-400');
        const url = await linkLocator.innerText();
        console.log(`Sending GET request to unlock: ${bookTitle} with code: ${codigo}`);//mensaje debug

        
        try {// se intenta recibir una respuesta de la API
            const response = await axios.get(
           url,
            {
                params: {
                bookTitle: bookTitle,
                unlockCode: codigo
                }
            }
            );
            
            
            console.log('API response:', response.data);// mensaje debug con los datos recibidos
            codigo = extractPassword(response.data); //se extra la contraseña
        } catch (err) {
            console.error('Failed to send challenge unlock request:', err.response?.data || err.message);// y recibir un error si algo salio mal
        }
        const closeBtn = page.locator('button[aria-label="Cerrar modal"]');//y se cierra la documentacion para
        await closeBtn.waitFor();
        await closeBtn.click();
        
      }
      const input = page.locator('input[type="text"]');
      await input.waitFor();
      
      await input.fill(codigo);// se encuentra el input y se inserta el codigo
      

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.waitFor();
      await submitButton.click();// se envia el codigo
      if (i>2){
        await page.waitForTimeout(5000);//si es uno de los dos ultimos se espera para observar que es el codigo correcto el que fue ingresado
        const closeBtn = page.locator('button[aria-label="Cerrar modal"]');
        await closeBtn.waitFor();
        await closeBtn.click();
      }

    }
    
    
    const downloadButton = page.locator('button:has(span:has-text("Descargar"))');
    const download = await tryDownload(page, downloadButton); //se descarga el pdf

    
    
    const filePath = path.join(downloadsPath, `manuscrito-${101+i}.pdf`);// se crea un  path en los archivos locales
    await download.saveAs(filePath);// se guarda en ese path
    
    
    if(i<4){//y si no es el ultimo 
        
        await page.waitForTimeout(1000);// se espera hasta terminar la descarga
        codigo = await extractCodigoFromPDF(filePath);// se extrae el codigo
    }
    

    
  }
  console.log("test terminado");// y aqui se manda un mensaje de que se termino
}
iniciarAventura()// y se empieza la funcion principal

/*🌙 En la bruma nocturna, el guardián revela:
   "Cuando el monje @ sherpa dot local despierte,
    y la cripta con su clave secreta se abra,
    'cript@123' será el hechizo que liberará
    los pergaminos de su eterno letargo." 🌙*/