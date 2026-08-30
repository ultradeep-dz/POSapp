window.numberToWords = function(amount, lang) {
    amount = Math.abs(parseFloat(amount)) || 0;
    let dinars = Math.floor(amount);
    let centimes = Math.round((amount - dinars) * 100);

    // ====== ENGLISH ======
    if (lang === 'en') {
        const enUnits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
        const enTens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

        function convertEn(n) {
            if (n === 0) return "Zero";
            if (n < 20) return enUnits[n];
            if (n < 100) return enTens[Math.floor(n / 10)] + (n % 10 !== 0 ? "-" + enUnits[n % 10].toLowerCase() : "");
            if (n < 1000) return enUnits[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convertEn(n % 100).toLowerCase() : "");
            if (n < 1000000) return convertEn(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convertEn(n % 1000).toLowerCase() : "");
            if (n < 1000000000) return convertEn(Math.floor(n / 1000000)) + " Million" + (n % 1000000 !== 0 ? " " + convertEn(n % 1000000).toLowerCase() : "");
            return n.toString();
        }

        let dStr = dinars === 0 ? "Zero" : convertEn(dinars);
        let cStr = centimes === 0 ? "Zero" : convertEn(centimes);
        let dUnit = dinars === 1 ? "Dinar" : "Dinars";
        let cUnit = centimes === 1 ? "Centime" : "Centimes";
        let ret = `${dStr} Algerian ${dUnit}`;
        if (centimes > 0) ret += ` and ${cStr} ${cUnit}`;
        return ret;
    }

    // ====== FRENCH ======
    else if (lang === 'fr') {
        const frUnits = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
        const frTens = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante-dix", "quatre-vingts", "quatre-vingt-dix"];

        function convertFr(n) {
            if (n === 0) return "zéro";
            if (n < 20) return frUnits[n];
            if (n < 70) {
                let t = Math.floor(n / 10);
                let u = n % 10;
                if (u === 0) return frTens[t];
                if (u === 1) return frTens[t] + " et un";
                return frTens[t] + "-" + frUnits[u];
            }
            if (n < 80) {
                if (n === 71) return "soixante et onze";
                return "soixante-" + frUnits[n - 60];
            }
            if (n < 100) return "quatre-vingt" + (n === 80 ? "s" : "-" + frUnits[n - 80]);
            if (n < 1000) {
                let h = Math.floor(n / 100);
                let hStr = h === 1 ? "cent" : frUnits[h] + " cent";
                if (n % 100 === 0 && h > 1) hStr += "s";
                return hStr + (n % 100 !== 0 ? " " + convertFr(n % 100) : "");
            }
            if (n < 1000000) {
                let t = Math.floor(n / 1000);
                let tStr = t === 1 ? "mille" : convertFr(t) + " mille";
                return tStr + (n % 1000 !== 0 ? " " + convertFr(n % 1000) : "");
            }
            if (n < 1000000000) {
                let m = Math.floor(n / 1000000);
                let mStr = convertFr(m) + " million" + (m > 1 ? "s" : "");
                return mStr + (n % 1000000 !== 0 ? " " + convertFr(n % 1000000) : "");
            }
            return n.toString();
        }

        let dStr = convertFr(dinars);
        dStr = dStr.charAt(0).toUpperCase() + dStr.slice(1); // Capitalize first letter
        let cStr = convertFr(centimes);
        let dUnit = "Dinar" + (dinars > 1 ? "s" : "");
        let cUnit = "Centime" + (centimes > 1 ? "s" : "");
        let ret = `${dStr} ${dUnit} Algérien${dinars > 1 ? 's' : ''}`;
        if (centimes > 0) ret += ` et ${cStr} ${cUnit}`;
        return ret;
    }

    // ====== ARABIC (default) ======
    else {
        const arUnits = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
        const arTeens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
        const arTens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
        const arHundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

        function convertAr(n) {
            if (n === 0) return "صفر";
            if (n < 10) return arUnits[n];
            if (n < 20) return arTeens[n - 10];
            if (n < 100) {
                let u = n % 10;
                let t = Math.floor(n / 10);
                if (u === 0) return arTens[t];
                return arUnits[u] + " و" + arTens[t];
            }
            if (n < 1000) {
                let h = Math.floor(n / 100);
                let rem = n % 100;
                let hStr = arHundreds[h];
                if (rem === 0) return hStr;
                return hStr + " و" + convertAr(rem);
            }
            if (n < 1000000) {
                let th = Math.floor(n / 1000);
                let rem = n % 1000;
                let thStr = "";
                if (th === 1) thStr = "ألف";
                else if (th === 2) thStr = "ألفان";
                else if (th >= 3 && th <= 10) thStr = convertAr(th) + " آلاف";
                else thStr = convertAr(th) + " ألفا";
                if (rem === 0) return thStr;
                return thStr + " و" + convertAr(rem);
            }
            if (n < 1000000000) {
                let m = Math.floor(n / 1000000);
                let rem = n % 1000000;
                let mStr = "";
                if (m === 1) mStr = "مليون";
                else if (m === 2) mStr = "مليونان";
                else if (m >= 3 && m <= 10) mStr = convertAr(m) + " ملايين";
                else mStr = convertAr(m) + " مليونا";
                if (rem === 0) return mStr;
                return mStr + " و" + convertAr(rem);
            }
            return n.toString();
        }

        let dStr = dinars === 0 ? "صفر" : convertAr(dinars);
        let cStr = centimes === 0 ? "صفر" : convertAr(centimes);
        
        // special localized units logic
        let dUnit = "دينار جزائري";
        let cUnit = "سنتيم";
        
        let dMod = dinars % 100;
        if (dinars === 1) { dStr = "دينار جزائري واحد"; dUnit = ""; }
        else if (dinars === 2) { dStr = "ديناران جزائريان"; dUnit = ""; }
        else if (dMod >= 3 && dMod <= 10) { dUnit = "دنانير جزائرية"; }
        
        let cMod = centimes % 100;
        if (centimes === 1) { cStr = "سنتيم واحد"; cUnit = ""; }
        else if (centimes === 2) { cStr = "سنتيمان"; cUnit = ""; }
        else if (cMod >= 3 && cMod <= 10) { cUnit = "سنتيمات"; }

        let ret = (dUnit ? dStr + " " + dUnit : dStr).trim();
        if (centimes > 0) {
            ret += " و " + (cUnit ? cStr + " " + cUnit : cStr).trim();
        }
        return ret;
    }
};
