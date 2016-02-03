﻿module DarkReader {

    export interface FilterConfig {
        mode: FilterMode;
        brightness: number;
        contrast: number;
        grayscale: number;
        sepia: number;
        useFont: boolean;
        fontFamily: string;
        textStroke: number;
        siteList: string[];
        invertListed: boolean;
        
        // OBSOLETE
        //usefont: boolean;
        //fontfamily: string;
        //textstroke: number;
        //ignorelist: string[];
    }

    export interface ObsoleteFilterConfig {
        usefont: boolean;
        fontfamily: string;
        textstroke: number;
        ignorelist: string[];
    }

    export enum FilterMode {
        light = 0,
        dark = 1
    }

    export var DEFAULT_FILTER_CONFIG: DarkReader.FilterConfig = {
        mode: DarkReader.FilterMode.dark,
        brightness: 110,
        contrast: 90,
        grayscale: 20,
        sepia: 10,
        useFont: false,
        fontFamily: 'Segoe UI',
        textStroke: 0,
        invertListed: false,
        siteList: []
    };

    /**
     * Configurable CSS-generator based on CSS-filters.
     * It creates rule to invert a whole page and creates another rule to revert specific blocks back.
     */
    export class FilterCssGenerator {

        /**
         * Creates configurable CSS-generator based on CSS-filters.
         */
        constructor() {
            // Detect Chromium issue 501582
            var m = navigator.userAgent.toLowerCase().match(/chrom[e|ium]\/([^ ]+)/);
            if (m && m[1]) {
                var chromeVersion = m[1];
                if (chromeVersion >= '45.0.2431.0') {
                    this.issue501582 = true;
                }
            }
        }

        issue501582: boolean;

        /**
         * Generates CSS code.
         * @param config Generator configuration.
         * @param url Web-site address.
         */
        createCssCode(config: FilterConfig, url: string): string {
            var isUrlInDarkList = isUrlInList(url, DARK_SITES);
            var isUrlInUserList = isUrlInList(url, config.siteList);

            if ((isUrlInUserList && config.invertListed)
                || (!isUrlInDarkList
                    && !config.invertListed
                    && !isUrlInUserList)
            ) {
                console.log('Creating CSS for url: ' + url);

                // Search for custom fix
                var fix = getFixesFor(url);
                
                //
                // Combine CSS

                var parts: string[] = [];

                parts.push('@media screen {');

                // Add leading rule.
                parts.push(this.createLeadingRule(config));

                if (config.mode === FilterMode.dark)
                    // Add contrary rule
                    if (fix.selectors) {
                        parts.push(this.createContraryRule(config, fix.selectors));
                    }

                if (config.useFont || config.textStroke > 0)
                    // Add text rule
                    parts.push('* ' + this.createTextDeclaration(config));
                    
                // Fix <html> height
                parts.push('html { min-height: 100% !important; }');

                // Full screen fix
                parts.push('*:-webkit-full-screen, *:-webkit-full-screen * { -webkit-filter: none !important; }');

                // --- WARNING! HACK! ---
                if (this.issue501582) {
                    // NOTE: Chrome 45 temp <html> background fix
                    // https://code.google.com/p/chromium/issues/detail?id=501582
                    
                    //
                    // Interpolate background color (fastest, no script required).
                    // http://www.w3.org/TR/filter-effects/#brightnessEquivalent
                    
                    // Brightness
                    var value = config.mode === FilterMode.dark ? 0 : 1;
                    value = value * (config.brightness) / 100;
                    
                    // Contrast
                    value = value * (config.contrast) / 100 - (0.5 * config.contrast / 100) + 0.5
                    
                    // Grayscale?
                    
                    // Sepia
                    var rgbaMatrix = [[value], [value], [value], [1]];
                    var sepia = config.sepia / 100;
                    var sepiaMatrix = [
                        [(0.393 + 0.607 * (1 - sepia)), (0.769 - 0.769 * (1 - sepia)), (0.189 - 0.189 * (1 - sepia)), 0],
                        [(0.349 - 0.349 * (1 - sepia)), (0.686 + 0.314 * (1 - sepia)), (0.168 - 0.168 * (1 - sepia)), 0],
                        [(0.272 - 0.272 * (1 - sepia)), (0.534 - 0.534 * (1 - sepia)), (0.131 + 0.869 * (1 - sepia)), 0],
                        [0, 0, 0, 1]
                    ];
                    var resultMatrix = multiplyMatrices(sepiaMatrix, rgbaMatrix);
                    var r = resultMatrix[0][0], g = resultMatrix[1][0], b = resultMatrix[2][0];
                    
                    // Result color
                    if (r > 1) r = 1; if (r < 0) r = 0;
                    if (g > 1) g = 1; if (g < 0) g = 0;
                    if (b > 1) b = 1; if (b < 0) b = 0;
                    var color = {
                        r: Math.round(255 * r),
                        g: Math.round(255 * g),
                        b: Math.round(255 * b),
                        toString() { return `rgb(${this.r},${this.g},${this.b})`; }
                    };
                    parts.push(`html { background: ${color} !important; }`);
                }

                if (fix.rules) {
                    parts.push(fix.rules);
                }

                parts.push('}');

                // TODO: Formatting for readability.
                return parts.join('\\n');
            }

            // Site is not inverted
            console.log('Site is not inverted: ' + url);
            return '';
        }


        //-----------------
        // CSS Declarations
        //-----------------

        protected createLeadingRule(config: FilterConfig): string {
            var result = 'html { -webkit-filter: ';

            if (config.mode === FilterMode.dark)
                result += 'invert(100%) hue-rotate(180deg) ';

            result += config.brightness == 100 ? ''
                : 'brightness(' + config.brightness + '%) ';

            result += config.contrast == 100 ? ''
                : 'contrast(' + config.contrast + '%) ';

            result += config.grayscale == 0 ? ''
                : 'grayscale(' + config.grayscale + '%) ';

            result += config.sepia == 0 ? ''
                : 'sepia(' + config.sepia + '%) ';

            result += '!important; }';

            return result;
        }

        // Should be used in 'dark mode' only
        protected createContraryRule(config: FilterConfig, selectorsToFix: string): string {
            var result = selectorsToFix + ' { -webkit-filter: ';

            // Less/more brightness for inverted items
            result += 'brightness(' + (config.brightness - 0) + '%) ';

            result += 'invert(100%) hue-rotate(180deg) ';

            result += '!important; }';

            return result;
        }

        // Should be used only if 'usefont' is 'true' or 'stroke' > 0
        protected createTextDeclaration(config: FilterConfig): string {
            var result = '{ ';

            if (config.useFont) {
                // TODO: Validate...
                result += !config.fontFamily ? ''
                    : 'font-family: '
                    + config.fontFamily + ' '
                    + '!important; ';
            }

            if (config.textStroke > 0) {
                result += config.textStroke == 0 ? ''
                    : '-webkit-text-stroke: '
                    + config.textStroke + 'px '
                    + '!important; ';
            }

            result += '}';

            return result;
        }
    }
    
    // http://stackoverflow.com/a/27205510/4137472
    function multiplyMatrices(m1: number[][], m2: number[][]) {
        var result: number[][] = [];
        for (var i = 0; i < m1.length; i++) {
            result[i] = [];
            for (var j = 0; j < m2[0].length; j++) {
                var sum = 0;
                for (var k = 0; k < m1[0].length; k++) {
                    sum += m1[i][k] * m2[k][j];
                }
                result[i][j] = sum;
            }
        }
        return result;
    }
} 
