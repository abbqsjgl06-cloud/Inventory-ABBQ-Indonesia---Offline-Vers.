/* ==========================================
   ABBQ Waste Tracker
   helper.js
   Version : 1.0
========================================== */

"use strict";

const Helper = (() => {

    /* ======================================
       UUID
    ====================================== */

    function uuid() {

        if (window.crypto && crypto.randomUUID) {

            return crypto.randomUUID();

        }

        return "id-" +
            Date.now() +
            "-" +
            Math.random()
                .toString(16)
                .substring(2);

    }

    /* ======================================
       TODAY
    ====================================== */

    function today() {

        return new Date()

            .toISOString()

            .substring(0, 10);

    }

    /* ======================================
       NOW
    ====================================== */

    function now() {

        return Date.now();

    }

    /* ======================================
       DATE FORMAT
    ====================================== */

    function formatDate(date) {

        if (!date) return "-";

        return new Date(date)

            .toLocaleDateString(

                "id-ID",

                {

                    day: "2-digit",

                    month: "long",

                    year: "numeric"

                }

            );

    }

    /* ======================================
       TIME FORMAT
    ====================================== */

    function formatTime(date) {

        if (!date) return "-";

        return new Date(date)

            .toLocaleTimeString(

                "id-ID",

                {

                    hour: "2-digit",

                    minute: "2-digit"

                }

            );

    }

    /* ======================================
       DATETIME
    ====================================== */

    function formatDateTime(date) {

        return formatDate(date)

            + " "

            + formatTime(date);

    }

    /* ======================================
       NUMBER
    ====================================== */

    function number(value) {

        const n = Number(value);

        if (isNaN(n))

            return 0;

        return n;

    }

    /* ======================================
       TEXT
    ====================================== */

    function text(value) {

        if (!value)

            return "";

        return value

            .toString()

            .trim();

    }

    /* ======================================
       EMPTY
    ====================================== */

    function isEmpty(value) {

        return (

            value === null ||

            value === undefined ||

            value === ""

        );

    }

    /* ======================================
       WASTE NUMBER
    ====================================== */

    function wasteNumber() {

        const d = new Date();

        return "WS-" +

            d.getFullYear()

            +

            String(

                d.getMonth() + 1

            ).padStart(2, "0")

            +

            String(

                d.getDate()

            ).padStart(2, "0")

            +

            "-"

            +

            String(

                d.getHours()

            ).padStart(2, "0")

            +

            String(

                d.getMinutes()

            ).padStart(2, "0")

            +

            String(

                d.getSeconds()

            ).padStart(2, "0");

    }

    /* ======================================
       BROKEN CHICKEN TRACKING NUMBER
    ====================================== */

    function brokenChickenNumber() {

        const d = new Date();

        return "BC-" +
            d.getFullYear() +
            String(d.getMonth() + 1).padStart(2, "0") +
            String(d.getDate()).padStart(2, "0") +
            "-" +
            String(d.getHours()).padStart(2, "0") +
            String(d.getMinutes()).padStart(2, "0") +
            String(d.getSeconds()).padStart(2, "0");

    }

    /* ======================================
       CURRENCY
    ====================================== */

    function currency(value) {

        return new Intl.NumberFormat(

            "id-ID"

        ).format(number(value));

    }

    /* ======================================
       RETURN
    ====================================== */

    return {

        uuid,

        today,

        now,

        formatDate,

        formatTime,

        formatDateTime,

        number,

        text,

        isEmpty,

        wasteNumber,

        brokenChickenNumber,

        currency

    };

})();