/*
 * mc8020.js - ZTE script for MC8020 (based on zte.js)
 *
 * Changes from zte.js:
 *   1. MC8020 detected -> hash forced to SHA256 (was hex_md5)
 *   2. lte_band_selection uses SET_LTE_BAND_LOCK with SHA256 AD (was BAND_SELECT + hash())
 *   3. B3+B7 preset button added to LTE band selection UI
 *
 * Original code by Miononno https://github.com/tpoechtrager/ZTE-Web-Script
 * https://www.youtube.com/watch?v=1kanq1w2DA0
 * Enhanced by unknown @ lteforum.at
 * MC8020 adaptation
 */

console.log("Loading ZTE MC8020 Script v" + "2025-05-20-#1");

siginfo =
    "wan_active_band,wan_active_channel,wan_lte_ca,wan_apn,wan_ipaddr," +
    "cell_id,dns_mode,prefer_dns_manual,standby_dns_manual,network_type," +

    "network_provider_fullname," +
    "rmcc,rmnc," +

    "ip_passthrough_enabled," +

    "bandwidth," +
    "tx_power," +

    "rscp_1,ecio_1,rscp_2,ecio_2,rscp_3,ecio_3,rscp_4,ecio_4," +

    "ngbr_cell_info," +
    "lte_multi_ca_scell_info,lte_multi_ca_scell_sig_info," +
    "lte_band,lte_rsrp,lte_rsrq," +
    "lte_rsrq,lte_rssi,lte_rsrp,lte_snr," +
    "lte_ca_pcell_band,lte_ca_pcell_freq,lte_ca_pcell_bandwidth," +
    "lte_ca_scell_band,lte_ca_scell_bandwidth," +
    "lte_rsrp_1,lte_rsrp_2,lte_rsrp_3,lte_rsrp_4," +
    "lte_snr_1,lte_snr_2,lte_snr_3,lte_snr_4," +
    "lte_pci,lte_pci_lock,lte_earfcn_lock," +

    "5g_rx0_rsrp,5g_rx1_rsrp,Z5g_rsrp,Z5g_rsrq,Z5g_SINR," +
    "nr5g_cell_id,nr5g_pci," +
    "nr5g_action_channel,nr5g_action_band," +
    "nr5g_action_nsa_band," +
    "nr_ca_pcell_band,nr_ca_pcell_freq," +
    "nr_multi_ca_scell_info," +
    "nr5g_sa_band_lock,nr5g_nsa_band_lock," +

    "pm_sensor_ambient,pm_sensor_mdm,pm_sensor_5g,pm_sensor_pa1,wifi_chip_temp";

is_mc888 = false;
is_mc889 = false;
is_mc8020 = false;
logged_in_as_developer = false;
dev_hardware_version = "";
dev_web_version = "";
dev_model = "";

function dump_variable(v)
{
    for (property in v)
    {
        try
        {
            console.log(property + ":" + JSON.stringify(v[property]));
        }
        catch { }
    }
}

function var2html(prefix, v)
{
    for (index in v)
    {
        var items = v[index];

        for (item_index in items)
            $("#" + prefix + "_" + index + "_" + item_index).html(items[item_index]);
    }
}

function test_cmd(cmd)
{
    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: cmd,
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            console.log(a);
        }
    });
}

// https://stackoverflow.com/a/68009748/1392778
window.cookies = window.cookies ||
{
    // https://stackoverflow.com/a/25490531/1028230
    get: function(name)
    {
        var b = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return b ? b.pop() : null;
    },

    delete: function(name)
    {
        document.cookie = '{0}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;'
            .replace('{0}', name);
    },

    set: function(name, value)
    {
        document.cookie =
            '{0}={1};expires=Fri, 31 Dec 9999 23:59:59 GMT;path=/;SameSite=Lax'
            .replace('{0}', name)
            .replace('{1}', value);
    }
};

function show_logout_and_shutdown_buttons()
{
    document.getElementById("logout").childNodes.forEach(el => {
        $(el).hide();
        $(el).show();
    });
}

wait_for_log_in_done = false;
function wait_for_log_in()
{
    check_log_in(
        function()
        {
            if (wait_for_log_in_done) return;
            wait_for_log_in_done = true;

            inject_html();
            get_status();

            show_logout_and_shutdown_buttons_i = 0;
            show_logout_and_shutdown_buttons_timer_id = window.setInterval(function() {
                show_logout_and_shutdown_buttons();
                if (++show_logout_and_shutdown_buttons_i >= 6)
                    window.clearInterval(show_logout_and_shutdown_buttons_timer_id);
            }, 500);

            show_logout_and_shutdown_buttons();

            window.setInterval(get_status, 1000);
            window.setInterval(prevent_automatic_logout, 60000);

            window.clearInterval(wait_for_log_in_timer_id);
        },

        function()
        {
            if (typeof show_log_in_info_once === "undefined")
                console.log("Contents of script will show once you are logged in!");
            show_log_in_info_once = true;
        }
    );
}

function init()
{
    wait_for_log_in_timer_id = window.setInterval(wait_for_log_in, 250);
    wait_for_log_in();
}

function perform_automatic_login_or_init()
{
    if (have_admin_password_hash())
    {
        check_log_in(

            function()
            {
                console.log("Already logged in ...");
                init();
            },

            function()
            {
                console.log("Logging in ...");
                perform_login(function() {
                    console.log("... logged in");
                    init();
                    hash_fix_i = 0;
                    hash_fix_timer_id = window.setInterval(function() {
                        window.location.hash = "home";
                        if (++hash_fix_i >= 10) window.clearInterval(hash_fix_timer_id);
                    }, 100);
                });
            }

        );
    }
    else init();
}

/*
 * Wait until inner version string is available.
 */
prepare_2_done = false;
function prepare_2()
{
    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: "wa_inner_version,hardware_version,web_version",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            if (!a.wa_inner_version || a.wa_inner_version == "" || prepare_2_done) return;
            prepare_2_done = true;

            is_mc888 = a.wa_inner_version.indexOf("MC888") > -1;
            is_mc889 = a.wa_inner_version.indexOf("MC889") > -1;
            is_mc8020 = a.wa_inner_version.indexOf("MC8020") > -1;

            dev_model = a.wa_inner_version.split(",")[0];
            dev_hardware_version = a.hardware_version || "";
            dev_web_version = a.web_version || "";

            if (is_mc888 || is_mc889 || is_mc8020) hash = SHA256;
            else hash = hex_md5;

            perform_automatic_login_or_init();

            window.clearInterval(prepare_2_timer_id);
        }
    })
}

/*
 * Wait until SHA256() is available.
 */
function prepare_1()
{
    if (typeof SHA256 === "undefined")
    {
        return;
    }

    window.clearInterval(prepare_1_timer_id);

    prepare_2_timer_id = window.setInterval(prepare_2, 250);
    prepare_2();
}

function make_hidden_settings_visible()
{
    alert("This option makes hidden device settings visible.\n" +
          "Hidden settings are marked with a '[hidden option]' suffix");

    window.setInterval(function() {
        Array.from(document.querySelectorAll('*')).forEach(el => {
            if($("#ipv4_section").length > 0) {
                $('#ipv4_section .row').css('display', 'block');
            }
            if (el.classList.contains("hide")) {
                el.classList.remove("hide");
                el.innerHTML += "&nbsp;[hidden option]";
            }
        })},
    1000);
}

function have_admin_password_hash()
{
    return cookies.get("admin_password_hash") !== null;
}

function perform_login(successCallback, developer_login = false, save_password_hash = false)
{
    var password_hash = "";

    if (have_admin_password_hash())
        password_hash = cookies.get("admin_password_hash");

    if (password_hash == "")
    {
        var password = prompt("Router Password");

        if (password == null || password == "")
            return;

        password_hash = SHA256(password);
    }

    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: "wa_inner_version,cr_version,RD,LD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD);
            $.ajax({
                type: "POST",
                url: "/goform/goform_set_cmd_process",
                data:
                {
                    isTest: "false",
                    goformId: developer_login ? "DEVELOPER_OPTION_LOGIN" : "LOGIN",
                    password: SHA256(password_hash + a.LD),
                    AD: ad
                },
                success: function(a)
                {
                    var j = JSON.parse(a);
                    console.log(j);
                    if ("0" == j.result)
                    {
                        if (save_password_hash) cookies.set("admin_password_hash", password_hash);
                        if (successCallback) successCallback();
                    }
                    else
                    {
                        var reason = "";
                        switch (j.result)
                        {
                            case "1":
                            {
                                reason = "Try again later";
                                break;
                            }
                            case "3":
                            {
                                reason = "Wrong Password";
                                if (have_admin_password_hash())
                                {
                                    console.log("Wrong password. Removing stored password hash ...");
                                    cookies.delete("admin_password_hash");
                                }
                                break;
                            }
                            default: reason = "Unknown";
                        }
                        alert((developer_login ? "Developer login" : "Login") + " failed! Reason: " + reason + ".");
                    }
                },
                error: err
            });
        }
    });
}

function prevent_automatic_logout()
{
    $.ajax({
        type: "GET",
        url: "/tmpl/network/apn_setting.html?v=" + Math.round(+new Date() / 1000)
    });
}

function enable_automatic_login()
{
    var res = confirm("You can make this script log in for you\n" +
                      "once you paste it into the developer console.\n\n" +
                      "The password will be stored in a cookie as an SHA256 hash.\n\n" +
                      "Continue?");

    if (!res)
        return;

    cookies.delete("admin_password_hash");

    perform_login(function() {
        alert("Successfully saved password as hash!");
    }, false, true);
}

function check_log_in(logged_in_callback, not_logged_in_callback = null)
{
    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            multi_data: "1",
            cmd: "loginfo"
        },
        dataType: "json",
        success: function(a)
        {
            if (a.loginfo.toLowerCase() == "ok")
            {
                if (logged_in_callback)
                    logged_in_callback();
            }
            else
            {
                if (not_logged_in_callback)
                    not_logged_in_callback();
            }
        },
        error: err
    });
}

class LteCaCellInfo
{
    constructor(pci, band, earfcn, bandwidth, rssi, rsrp1, rsrp2, rsrp3, rsrp4, rsrq, sinr1, sinr2, sinr3, sinr4)
    {
        this.pci = pci;
        this.band = band;
        this.earfcn = earfcn;
        this.bandwidth = bandwidth;
        this.rssi = rssi;
        this.rsrp1 = rsrp1;
        this.rsrp2 = rsrp2;
        this.rsrp3 = rsrp3;
        this.rsrp4 = rsrp4;
        this.rsrq = rsrq;
        this.sinr1 = sinr1;
        this.sinr2 = sinr2;
        this.sinr3 = sinr3;
        this.sinr4 = sinr4;
    }
}

function parse_lte_cell_info()
{
    if (!is_lte)
        return [];

    var lte_cells = [];

    var lte_main_band =
        (lte_ca_pcell_band != "" ? lte_ca_pcell_band : lte_band);

    if (lte_main_band == "")
        lte_main_band = "??";

    var pci = lte_pci ? parseInt(lte_pci, 16) : "N/A";
    lte_cells.push(new LteCaCellInfo(
        pci,
        "B" + lte_main_band,
        lte_ca_pcell_freq == "" ? wan_active_channel : lte_ca_pcell_freq,
        (lte_ca_pcell_bandwidth != "" ? lte_ca_pcell_bandwidth : bandwidth).replace("MHz", "").replace(".0", ""),
        lte_rssi,
        lte_rsrp_1,
        lte_rsrp_2,
        lte_rsrp_3,
        lte_rsrp_4,
        lte_rsrq,
        lte_snr_1,
        lte_snr_2,
        lte_snr_3,
        lte_snr_4
    ));

    var scell_infos = lte_multi_ca_scell_info.split(";").filter(n => n);
    var scell_sig_infos = lte_multi_ca_scell_sig_info.split(";").filter(n => n);

    for (var i = 0; i < scell_infos.length; i++)
    {
        if (scell_infos[i] == "")
            continue;

        var scell_info = scell_infos[i].split(",");
        var have_scell_sig_info = scell_sig_infos.length > i;
        var scell_sig_info = have_scell_sig_info ? scell_sig_infos[i].split(",") : undefined;

        if (scell_info.length < 6)
            continue;

        if (have_scell_sig_info && scell_sig_info.length < 3)
            continue;

        lte_cells.push(new LteCaCellInfo(
            parseInt(scell_info[1], 16),
            "B" + scell_info[3],
            scell_info[4],
            scell_info[5].replace(".0", ""),
            "",
            (have_scell_sig_info ? scell_sig_info[0] : "").replace("-44.0", "?????"),
            "",
            "",
            "",
            have_scell_sig_info ? scell_sig_info[1] : "",
            have_scell_sig_info ? scell_sig_info[2] : "",
            "",
            "",
            ""));
    }

    return lte_cells;
}

class NrCaCellInfo
{
    constructor(pci, band, arfcn, bandwidth, rsrp1, rsrp2, rsrq, sinr)
    {
        this.pci = pci;
        this.band = band;
        this.arfcn = arfcn;
        this.bandwidth = bandwidth;
        this.rsrp1 = rsrp1;
        this.rsrp2 = rsrp2;
        this.rsrq = rsrq;
        this.sinr = sinr;
        this.unchanged_updates = 0;
        this.info_text = "";
    }
}

function parse_nr_cell_info()
{
    if (!is_5g)
        return [];

    if (is_5g_nsa && !is_5g_nsa_active)
    {
        return [];
    }

    /*
     * There's apparently no better fix for this.
     * The API does not reset its memory correctly after switching from
     * 5G CA to 5G without CA.
     */
    var is_ca = nr_ca_pcell_freq == "" || nr5g_action_channel == nr_ca_pcell_freq;

    if (_5g_rx0_rsrp == "")
        _5g_rx0_rsrp = Z5g_rsrp;

    var nr_cells = [];

    var allowed_nr_bands =
        (is_5g_nsa ? nr5g_nsa_band_lock : nr5g_sa_band_lock).split(",");

    if (!is_ca) {
        var nr_band =
            (is_5g_nsa ? "n" + nr5g_action_nsa_band : nr5g_action_band);

        if (nr_band == "n" || nr_band == "n-1")
            nr_band = "n??";

        nr_cells.push(new NrCaCellInfo(
            parseInt(nr5g_pci, 16),
            nr_band,
            nr5g_action_channel,
            is_5g_nsa ? "" : bandwidth.replace("MHz", ""),
            _5g_rx0_rsrp,
            _5g_rx1_rsrp,
            Z5g_rsrq,
            Z5g_SINR.replace("-20.0", "?????").replace("-3276.8", "?????")
        ));

        previous_nr_cells = nr_cells;
        return nr_cells;
    }

    var pcc_band = nr_ca_pcell_band != ""
    ? nr_ca_pcell_band
    : (nr5g_action_band != ""
        ? (nr5g_action_band[0] == 'n' || nr5g_action_band[0] == 'N'
            ? nr5g_action_band.substr(1)
            : nr5g_action_band)
        : "??");

    var pcc_freq = nr_ca_pcell_freq != ""
        ? nr_ca_pcell_freq
        : (nr5g_action_channel != ""
            ? nr5g_action_channel
            : "??");

    nr_cells.push(new NrCaCellInfo(
        parseInt(nr5g_pci, 16),
        "n" + pcc_band,
        pcc_freq,
        bandwidth == "" ? "" : bandwidth.replace("MHz", ""),
        _5g_rx0_rsrp,
        _5g_rx1_rsrp,
        Z5g_rsrq,
        Z5g_SINR.replace("-20.0", "?????").replace("-3276.8", "?????")
    ));

    nr_multi_ca_scell_info.split(";").forEach(cell => {
        if (cell == "")
            return;

        var cell_data = cell.split(",");

        if (cell_data.length < 10)
            return;

        var nr_band = cell_data[3].replace("n", "");

        if (allowed_nr_bands.indexOf(nr_band) == -1)
            return;

        nr_cells.push(new NrCaCellInfo(
            cell_data[1],
            cell_data[3],
            cell_data[4],
            cell_data[5].replace("MHz", ""),
            cell_data[7],
            "",
            cell_data[8],
            cell_data[9].replace("0.0", "?????")
        ));
    });

    /*
     * Try to detect false data. See comment above.
     * Only do this for SCells.
     */
    if (false && typeof previous_nr_cells !== "undefined" && nr_cells.length == previous_nr_cells.length)
    {
        for (var i = 1; i < nr_cells.length; i++)
        {
            if (nr_cells[i].rsrp1 == previous_nr_cells[i].rsrp1 &&
                nr_cells[i].sinr == previous_nr_cells[i].sinr)
            {
                nr_cells[i].unchanged_updates = previous_nr_cells[i].unchanged_updates + 1;
                if (nr_cells[i].unchanged_updates >= 30)
                    nr_cells[i].info_text = "[Data might be invalid]";
            }
        }
    }

    previous_nr_cells = nr_cells;
    return nr_cells;
}

function get_band_info(cells)
{
    var bands = "";
    cells.forEach(cell => {
        var info = cell.band;
        if (cell.bandwidth != "") info += "(" + cell.bandwidth + "MHz)";
        bands += bands ? " + " : "";
        bands += info;
    });
    return bands;
}

function get_status()
{
    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: siginfo,
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            for (signal = a, vars = siginfo.split(','), e = 0; e < vars.length; e++)
            {
                v = vars[e];
                window[(!isNaN(v[0]) ? "_" : "" ) + v] = a[v];
            }

            is_umts = (network_type == "HSPA" || network_type == "HSDPA" || network_type == "HSUPA" || network_type == "HSPA+" || network_type == "DC-HSPA+" ||
                       network_type == "UMTS" || network_type == "CDMA" || network_type == "CDMA_EVDO" || network_type == "EVDO_EHRPD" || network_type == "TDSCDMA");

            is_lte = (network_type == "LTE" || network_type == "ENDC" || network_type == "EN-DC" || network_type == "LTE-NSA");
            is_lte_plus = (wan_lte_ca && (wan_lte_ca == "ca_activated" || wan_lte_ca == "ca_deactivated"));

            is_5g_sa = (network_type == "SA");
            is_5g_nsa = (network_type == "ENDC" || network_type == "EN-DC" || network_type == "LTE-NSA");
            is_5g_nsa_active = is_5g_nsa && network_type != "LTE-NSA";
            is_5g = is_5g_sa || is_5g_nsa;

            // Render NG-style info sections
            renderNetworkInfo();
            renderSignalInfo();
            renderWanInfo();
            renderDeviceInfo();

            // Update cell lock UI with current values
            update4gCellLockUi();
            update5gCellLockUi();

            // Highlight current bearer mode
            var netSelect = network_type;
            if (is_5g_sa) highlightBearer("Only_5G");
            else if (is_5g_nsa && is_5g_nsa_active) highlightBearer("LTE_AND_5G");
            else if (is_lte && !is_5g) highlightBearer("Only_LTE");
            else highlightBearer("WL_AND_5G");
        }
    })
}

function err(a, e, n)
{
    alert("Communication Error"), console.log(a), console.log(e), console.log(n)
}

function set_net_mode(mode = null)
{
    var modes = [
        "Only_GSM",
        "Only_WCDMA",
        "Only_LTE",
        "WCDMA_AND_GSM",
        "WCDMA_preferred",
        "WCDMA_AND_LTE",
        "GSM_AND_LTE",
        "CDMA_EVDO_LTE",
        "Only_TDSCDMA",
        "TDSCDMA_AND_WCDMA",
        "TDSCDMA_AND_LTE",
        "TDSCDMA_WCDMA_HDR_CDMA_GSM_LTE",
        "TDSCDMA_WCDMA_GSM_LTE",
        "GSM_WCDMA_LTE",
        "Only_5G",
        "LTE_AND_5G",
        "GWL_5G",
        "TCHGWL_5G",
        "WL_AND_5G",
        "TGWL_AND_5G",
        "4G_AND_5G"
    ];

    mode = mode || prompt("Enter one of\n" + modes.join(", "), "WL_AND_5G");
    if (!mode) return;

    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: "wa_inner_version,cr_version,RD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD);
            $.ajax({
                type: "POST",
                url: "/goform/goform_set_cmd_process",
                data:
                {
                    isTest: "false",
                    goformId: "SET_BEARER_PREFERENCE",
                    BearerPreference: mode,
                    AD: ad
                },
                success: function(a)
                {
                    console.log(a);
                    j = JSON.parse(a);
                    if ("success" != j.result)
                        alert("Setting mode to '" + mode + "' failed");
                },
                error: err
            })
        }
    })

}

function lte_cell_lock(reset = false, prefilled) {
    var lockParameters;

    if (reset) {
        lockParameters = ["0", "0"];
    } else {
        var defaultPciEarfcn = prefilled || (parseInt(lte_pci, 16) + "," + wan_active_channel);
        var cellLockDetails = prompt("Please input PCI,EARFCN, separated by ',' char (example 116,3350). "+
                                     "Leave default for lock on current main band.", defaultPciEarfcn);

        if (cellLockDetails === null || cellLockDetails.trim() === "") {
            return;
        }

        var inputValues = cellLockDetails.split(",");
        var pciIsValid = !isNaN(inputValues[0]) && Number.isInteger(parseFloat(inputValues[0]));
        var earfcnIsValid = !isNaN(inputValues[1]) && Number.isInteger(parseFloat(inputValues[1]));

        if (!pciIsValid || !earfcnIsValid) {
            alert("Invalid input. Please ensure all values are correctly formatted.");
            return;
        }

        lockParameters = inputValues;
    }

    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data: {
            cmd: "wa_inner_version,cr_version,RD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a) {
            ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD);
            $.ajax({
                type: "POST",
                url: "/goform/goform_set_cmd_process",
                data: {
                    isTest: "false",
                    goformId: "LTE_LOCK_CELL_SET",
                    lte_pci_lock: lockParameters[0],
                    lte_earfcn_lock: lockParameters[1],
                    AD: ad
                },
                success: function(a) {
                    var response = JSON.parse(a);
                    if (response.result === "success") {

                        var rebootMessage =
                            "You have to reboot your Router in order " +
                            (reset ? "to remove the cell lock" : "for the cell lock to be active") + ".\n\nReboot now?";

                        if (reset) {
                            rebootMessage += "\n\nIf 'NO SERVICE' persists after reboot, try setting LTE bands to AUTO then reboot again.";
                        }

                        if (confirm(rebootMessage)) {
                            reboot(true);
                        }
                    } else {
                        alert("Error.");
                    }
                },
                error: function(err) {
                    console.error(err);
                    alert("An error occurred while attempting to lock the cell.");
                }
            });
        }
    });
}

function nr_cell_lock(reset = false, prefilled) {
    var cellLockDetails;

    if (reset) {
        cellLockDetails = "0,0,0,0";
    } else {
        var defaultCellDetails = prefilled || "";

        if (!defaultCellDetails) {
            var nrCellInfo = parse_nr_cell_info();
            if (nrCellInfo.length > 0) {
                var primaryNrCell = nrCellInfo[0];
                defaultCellDetails = primaryNrCell.pci + ',' + primaryNrCell.arfcn + ',' + primaryNrCell.band.replace('n', '') + ',' + "30";
            }
        }

        cellLockDetails = prompt("Please input PCI,ARFCN,BAND,SCS separated by ',' char (example 202,639936,78,30). " +
                                 "Leave default for locking the current NR primary band. You may need to adjust the SCS.", defaultCellDetails);

        if (cellLockDetails === null || cellLockDetails.trim() === "") {
            return;
        } else {
            var inputValues = cellLockDetails.split(",");

            var pciIsValid = !isNaN(inputValues[0]) && Number.isInteger(parseFloat(inputValues[0]));
            var arfcnIsValid = !isNaN(inputValues[1]) && Number.isInteger(parseFloat(inputValues[1]));
            var bandIsValid = !isNaN(inputValues[2]) && Number.isInteger(parseFloat(inputValues[2]));
            var scsIsValid = ["15", "30", "60", "120", "240"].includes(inputValues[3]);

            if (!pciIsValid || !arfcnIsValid || !bandIsValid || !scsIsValid) {
                alert("Invalid input. Please ensure all values are correctly formatted.");
                return;
            }
        }
    }

    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data: {
            cmd: "wa_inner_version,cr_version,RD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a) {
            ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD);
            $.ajax({
                type: "POST",
                url: "/goform/goform_set_cmd_process",
                data: {
                    isTest: "false",
                    goformId: "NR5G_LOCK_CELL_SET",
                    nr5g_cell_lock: cellLockDetails,
                    AD: ad
                },
                success: function(a) {
                    var response = JSON.parse(a);
                    if (response.result === "success") {

                        var rebootMessage =
                            "You have to reboot your Router in order " +
                            (reset ? "to remove the cell lock" : "for the cell lock to be active")+ ".\n\nReboot now?";

                        if (confirm(rebootMessage)) {
                            reboot(true);
                        }
                    } else {
                        alert("Error.");
                    }
                },
                error: function(err) {
                    console.error(err);
                    alert("An error occurred while attempting to lock the cell.");
                }
            });
        }
    });
}

function get_lte_band_info()
{
    var resp = $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data: { cmd: "lte_band_lock,lte_band,lte_ca_pcell_band,lte_ca_scell_band,network_type,network_provider_fullname,lte_pci_lock,lte_earfcn_lock", multi_data: "1" },
        dataType: "json", async: false
    });
    if (resp.responseText && !resp.lte_band) resp = JSON.parse(resp.responseText);

    var lockVal = resp.lte_band_lock || "?";
    var lockStr = String(lockVal).replace(/^0x/i, '').toUpperCase();
    var activeBand = resp.lte_band || "?";
    var pcell = resp.lte_ca_pcell_band || "";
    var scell = resp.lte_ca_scell_band || "";
    var netType = resp.network_type || "?";
    var provider = resp.network_provider_fullname || "?";
    var pciLock = resp.lte_pci_lock || "0";
    var earfcnLock = resp.lte_earfcn_lock || "0";

    // Decode lock bits into human-readable band list (use BigInt for >32-bit values)
    var lockedBands = [];
    if (lockStr.length > 0 && lockStr !== "?") {
        var lockBig = BigInt("0x" + lockStr);
        for (var i = 0; i < 64; i++) {
            if (lockBig & (BigInt(1) << BigInt(i))) lockedBands.push("B" + (i + 1));
        }
    }

    var info = "";
    info += "[mc8020] Network: " + provider + " (" + netType + ")\n";
    info += "[mc8020] Active Band: B" + activeBand;
    if (pcell) info += " (CA PCell: B" + pcell + ", SCell: B" + scell + ")";
    info += "\n";
    info += "[mc8020] Lock Value: " + lockVal;
    info += "\n";
    info += "[mc8020] Lock Bits (" + lockedBands.length + " bands): " + (lockedBands.length > 0 ? lockedBands.join(" | ") : "(AUTO / no lock)");
    info += "\n";
    if (pciLock != "0" && earfcnLock != "0") {
        info += "[mc8020] Cell Lock: PCI=" + pciLock + ", EARFCN=" + earfcnLock + " (LOCKED)";
    } else {
        info += "[mc8020] Cell Lock: (unlocked)";
    }

    console.log(info);
    return info;
}

function lte_band_selection(b = null, nested_attempt_with_dev_login = false)
{
    b = b || prompt("Please input LTE bands number, separated by + char (example 3+7). If you want to use every supported band, write 'AUTO'.", "AUTO");

    if (null != (b = b && b.toLowerCase()) && "" !== b)
    {
        var bands = b.split("+");
        var n = 0;
        var all_bands = "0xA3E2AB0908DF";

        if ("auto" === b)
        {
            n = all_bands;
        }
        else
        {
            for (var i = 0; i < bands.length; i++) n += Math.pow(2, parseInt(bands[i]) - 1);
            n = n.toString(16);
            n = "0x" + (Math.pow(10, 11 - n.length) + n + "").substr(1);
        }

        var rdResp = $.ajax({
            type: "GET",
            url: "/goform/goform_get_cmd_process",
            data: { cmd: "wa_inner_version,cr_version,RD", multi_data: "1" },
            dataType: "json", async: false
        });
        if (rdResp.responseText && !rdResp.wa_inner_version) rdResp = JSON.parse(rdResp.responseText);

        var ad = SHA256(SHA256((rdResp.wa_inner_version || "") + (rdResp.cr_version || "")) + (rdResp.RD || ""));

        var result = { result: "failure" };
        $.ajax({
            type: "POST", url: "/goform/goform_set_cmd_process",
            data: 'isTest=false&goformId=SET_LTE_BAND_LOCK&lte_band_lock=' + n + '&AD=' + ad,
            dataType: "json", async: false,
            contentType: "application/x-www-form-urlencoded; charset=UTF-8",
            success: function(r) { result = r; },
            error: function(xhr) { result = { result: "error", status: xhr.status, text: xhr.responseText }; }
        });

        if (result.result === "success") {
            console.log("[mc8020] LTE band locked to " + b + " (" + n + "). Reboot required.");
        } else {
            console.log("[mc8020] LTE band lock failed. Result:", result);
        }
    }
}

function nr_band_selection(a)
{
    var e;
    var a = a || prompt("Please input 5G bands number, separated by + char (example 3+78). If you want to use every supported band, write 'AUTO'.", "AUTO");

    null != a && "" !== a && (e = a.split("+").join(","));
    "AUTO" === a.toUpperCase() && (e = "1,2,3,5,7,8,20,28,38,41,50,51,66,70,71,74,75,76,77,78,79,80,81,82,83,84");

    $.ajax({
            type: "GET",
            url: "/goform/goform_get_cmd_process",
            data:
            {
                cmd: "wa_inner_version,cr_version,RD",
                multi_data: "1"
            },
            dataType: "json",
            success: function(a)
            {
                ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD), $.ajax({
                    type: "POST",
                    url: "/goform/goform_set_cmd_process",
                    data:
                    {
                        isTest: "false",
                        goformId: "WAN_PERFORM_NR5G_BAND_LOCK",
                        nr5g_band_mask: e,
                        AD: ad
                    },
                    success: function(a)
                    {
                        console.log(a);
                    },
                    error: err
                })
            }
    });
}

function bridge_mode(enable)
{
    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: "wa_inner_version,cr_version,RD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD), $.ajax({
                type: "POST",
                url: "/goform/goform_set_cmd_process",
                data:
                {
                    isTest: "false",
                    goformId: "OPERATION_MODE",
                    opMode:	(enable ? "LTE_BRIDGE" : "PPP"),
                    ethernet_port_specified: "1",
                    AD: ad
                },
                success: function(a)
                {
                    console.log(a);
                    alert("Successfully " + (enable ? "enabled" : "disabled") + " bridge mode! Rebooting ..." +
                          (enable ? "\n\nIf your device has multiple LAN port then the lower one\nis the WAN/bridge port!" : ""));
                    reboot(true);
                },
                error: err
            })
        }
    })
}

function reboot(force = false)
{
    if (!force && !confirm("Reboot Router?"))
        return

    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: "wa_inner_version,cr_version,RD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            ad = hash(hash(a.wa_inner_version + a.cr_version) + a.RD), $.ajax({
                type: "POST",
                url: "/goform/goform_set_cmd_process",
                data:
                {
                    isTest: "false",
                    goformId: "REBOOT_DEVICE",
                    AD: ad
                },
                success: function(a)
                {
                    console.log(a);
                    if (!force) alert("Rebooting ...");
                },
                error: err
            })
        }
    })
}

function version_info()
{
    $.ajax({
        type: "GET",
        url: "/goform/goform_get_cmd_process",
        data:
        {
            cmd: "hardware_version,web_version,wa_inner_version,cr_version,RD",
            multi_data: "1"
        },
        dataType: "json",
        success: function(a)
        {
            v = "HW version: " + a.hardware_version + "\nWEB version: " + a.web_version + "\nWA INNER version: " + a.wa_inner_version;
            alert(v);
        }
    })
}

/* ---- NG-style UI helpers ---- */

function toHex(val, withPrefix) {
    if (val == null || isNaN(val)) return "-";
    var hex = Number(val).toString(16).toUpperCase();
    return (withPrefix ? "0x" : "") + hex;
}

function formatSeconds(seconds) {
    if (!seconds || isNaN(seconds)) return "-";
    var s = parseInt(seconds, 10);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60);   s %= 60;
    var parts = [];
    if (d > 0) parts.push(d + "d");
    if (h > 0) parts.push(h + "h");
    if (m > 0) parts.push(m + "m");
    if (s > 0 || parts.length === 0) parts.push(s + "s");
    return parts.join("");
}

function fmtBytes(val) {
    if (!val || isNaN(val)) return "-";
    var units = ["B","KB","MB","GB","TB"];
    var v = Number(val), i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(1) + " " + units[i];
}

function fmtSpeed(val) {
    if (!val || isNaN(val)) return "-";
    var mbit = (Number(val) * 8) / 1e6;
    return mbit.toFixed(2) + " Mbit/s";
}

function is4gBasedType(type) { return type === "LTE" || type === "ENDC" || type === "LTE-NSA"; }
function is5gBasedType(type) { return type === "SA" || type === "ENDC" || type === "LTE-NSA"; }

function get4gBandMask(bandNumber) { return 1n << BigInt(bandNumber - 1); }

function showUiFeedback(success) {
    var overlay = document.getElementById("ui-feedback-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "ui-feedback-overlay";
        overlay.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:48px;font-weight:bold;z-index:1000;pointer-events:none;display:none;";
        var box = document.getElementById("router-info-box");
        if (box) { box.style.position = "relative"; box.appendChild(overlay); }
    }
    overlay.textContent = success ? "✓" : "✗";
    overlay.style.color = success ? "green" : "red";
    overlay.style.display = "block";
    setTimeout(function() { overlay.style.display = "none"; }, 1000);
}

function highlightBearer(current) {
    ["Only_5G","LTE_AND_5G","WL_AND_5G","Only_LTE"].forEach(function(mode) {
        var btn = document.getElementById("bearer-" + mode);
        if (!btn) return;
        if (mode === current) {
            btn.style.background = "#4CAF50";
            btn.style.color = "white";
            btn.style.fontWeight = "bold";
        } else {
            btn.style.background = "";
            btn.style.color = "";
            btn.style.fontWeight = "normal";
        }
    });
}

function update4gBandLockHeader(maskNum) {
    var activeBands = [];
    for (var band = 1; band <= 44; band++) {
        if ((maskNum & get4gBandMask(band)) !== 0n) activeBands.push(band);
    }
    var bandList = activeBands.length > 0 ? activeBands.join(", ") : "auto";
    var header = document.getElementById("lte-band-lock-header");
    if (header) header.textContent = "4G Band Lock: (" + bandList + ")";
}

function update5gBandLockHeader(activeBands) {
    var bandList = activeBands.length > 0 ? activeBands.join(", ") : "auto";
    var header = document.getElementById("nr-band-lock-header");
    if (header) header.textContent = "5G Band Lock: (" + bandList + ")";
}

function update5gCellLockUi() {
    var lockBtn = document.getElementById("btn-lock-5g-cell");
    var title = document.getElementById("title-5g-celllock");
    if (!lockBtn || !title) return;
    lockBtn.dataset.pci = parseInt(nr5g_pci, 16) || "<PCI>";
    lockBtn.dataset.earfcn = nr5g_action_channel || "<EARFCN>";
    lockBtn.dataset.band = nr5g_action_band ? nr5g_action_band.replace("n","") : "<BAND>";
    title.textContent = "5G Cell Lock";
}

function update4gCellLockUi() {
    var lockBtn = document.getElementById("btn-lock-4g-cell");
    var title = document.getElementById("title-4g-celllock");
    if (!lockBtn || !title) return;
    lockBtn.dataset.pci = parseInt(lte_pci, 16) || "<PCI>";
    lockBtn.dataset.earfcn = wan_active_channel || "<EARFCN>";
    title.textContent = "4G Cell Lock";
}

function initButtonBlurHandler() {
    var panel = document.getElementById("router-info-panel");
    if (!panel) return;
    panel.addEventListener("click", function(e) {
        if (e.target && e.target.tagName === "BUTTON") e.target.blur();
    });
}

/* ---- NG-style info rendering ---- */

function renderNetworkInfo() {
    var table = document.getElementById("router-info-table");
    if (!table) return;
    var bandSummary = "-";
    var totalBandwidth = 0;
    var lteCells = parse_lte_cell_info();
    var nrCells = parse_nr_cell_info();

    var parts = [];
    nrCells.forEach(function(c) { if (c.band) parts.push("N" + c.band.replace("n","")); });
    lteCells.forEach(function(c) { if (c.band) parts.push(c.band); });
    if (parts.length > 0) bandSummary = parts.join(" + ");

    lteCells.forEach(function(c) { var bw = parseInt(c.bandwidth, 10); if (!isNaN(bw)) totalBandwidth += bw; });
    nrCells.forEach(function(c) { var bw = parseInt(c.bandwidth, 10); if (!isNaN(bw)) totalBandwidth += bw; });

    var connType = network_type || "-";
    if (connType === "SA") connType = "5G SA";
    else if (connType === "ENDC") connType = "5G NSA";

    var cellIdDisplay = "-";
    var nodeId = null, sectorId = null;
    if (is_lte && cell_id) {
        nodeId = Number(cell_id) >>> 8;
        sectorId = Number(cell_id) & 0xFF;
    } else if (nr5g_cell_id) {
        nodeId = Number(nr5g_cell_id) >>> 8;
        sectorId = Number(nr5g_cell_id) & 0xFF;
    }
    if (nodeId != null && sectorId != null) {
        cellIdDisplay = nodeId + '<span class="cellid-sep">|</span>' + sectorId;
    }

    table.innerHTML =
        '<tr><th>Provider</th><td>' + (network_provider_fullname || "-") + '</td></tr>' +
        '<tr><th>Connection</th><td>' + connType + '</td></tr>' +
        '<tr><th>Bands</th><td>' + bandSummary + '</td></tr>' +
        '<tr><th>BW</th><td>' + (totalBandwidth > 0 ? totalBandwidth + " MHz" : "-") + '</td></tr>' +
        '<tr><th>Cell ID</th><td>' + cellIdDisplay + '</td></tr>';
}

function renderSignalInfo() {
    var container = document.getElementById("signal-info-container");
    if (!container) return;
    container.innerHTML = "";

    function tf(val) { return val ? "✓" : "✗"; }

    // NR signals
    if (is5gBasedType(network_type)) {
        var nrCells = parse_nr_cell_info();
        if (nrCells.length > 0) {
            var grid = document.createElement("div");
            grid.className = "signal-grid";
            nrCells.forEach(function(cell, idx) {
                var box = document.createElement("div");
                box.className = "signal-cell";
                var bandTitle = cell.band ? cell.band : "NR Cell " + (idx + 1);
                box.innerHTML =
                    '<div class="cell-title">' + bandTitle + '</div>' +
                    '<table>' +
                    '<tr><th>RSRP</th><td>' + (cell.rsrp1 ?? "-") + '</td></tr>' +
                    '<tr><th>RSRQ</th><td>' + (cell.rsrq ?? "-") + '</td></tr>' +
                    '<tr><th>SINR</th><td>' + (cell.sinr ?? "-") + '</td></tr>' +
                    '<tr><th>PCI</th><td>' + (cell.pci ?? "-") + '</td></tr>' +
                    '<tr><th>BW</th><td>' + (cell.bandwidth ? cell.bandwidth + " MHz" : "-") + '</td></tr>' +
                    '<tr><th>ARFCN</th><td>' + (cell.arfcn ?? "-") + '</td></tr>' +
                    '</table>';
                grid.appendChild(box);
            });
            container.appendChild(grid);
        }
    }

    // LTE signals
    if (is_lte) {
        var lteCells = parse_lte_cell_info();
        if (lteCells.length > 0) {
            var grid = document.createElement("div");
            grid.className = "signal-grid";
            lteCells.forEach(function(cell, idx) {
                var box = document.createElement("div");
                box.className = "signal-cell";
                var bandTitle = cell.band || "Cell " + (idx + 1);
                box.innerHTML =
                    '<div class="cell-title">' + bandTitle + '</div>' +
                    '<table>' +
                    '<tr><th>RSRP</th><td>' + (cell.rsrp1 ?? "-") + '</td></tr>' +
                    '<tr><th>RSRQ</th><td>' + (cell.rsrq ?? "-") + '</td></tr>' +
                    '<tr><th>SINR</th><td>' + (cell.sinr1 ?? "-") + '</td></tr>' +
                    '<tr><th>RSSI</th><td>' + (cell.rssi ?? "-") + '</td></tr>' +
                    '<tr><th>PCI</th><td>' + (cell.pci ?? "-") + '</td></tr>' +
                    '<tr><th>BW</th><td>' + (cell.bandwidth ? cell.bandwidth + " MHz" : "-") + '</td></tr>' +
                    '<tr><th>EARFCN</th><td>' + (cell.earfcn ?? "-") + '</td></tr>' +
                    '</table>';
                grid.appendChild(box);
            });
            container.appendChild(grid);
        }
    }
}

function renderWanInfo() {
    var table = document.getElementById("wan-info-table");
    if (!table) return;
    var rows = "";
    if (wan_ipaddr) {
        rows += '<tr><th>IPv4 Address</th><td>' + wan_ipaddr + '</td></tr>';
    } else {
        rows += '<tr><th>IPv4 Address</th><td>-</td></tr>';
    }
    table.innerHTML = rows;
}

function renderDeviceInfo() {
    var table = document.getElementById("system-info-table");
    if (!table) return;
    var rows = "";

    if (dev_model) rows += '<tr><th>Model</th><td>' + dev_model + '</td></tr>';
    if (dev_hardware_version) rows += '<tr><th>Hardware</th><td>' + dev_hardware_version + '</td></tr>';
    if (dev_web_version) rows += '<tr><th>Firmware</th><td>' + dev_web_version + '</td></tr>';

    var temps = "";
    if (pm_sensor_ambient && pm_sensor_ambient > -40) temps += (temps ? "&nbsp;&nbsp;" : "") + "A:&nbsp;" + pm_sensor_ambient + "°C";
    if (pm_sensor_mdm && pm_sensor_mdm > -40) temps += (temps ? "&nbsp;&nbsp;" : "") + "M:&nbsp;" + pm_sensor_mdm + "°C";
    if (pm_sensor_5g && pm_sensor_5g > -40) temps += (temps ? "&nbsp;&nbsp;" : "") + "5G:&nbsp;" + pm_sensor_5g + "°C";
    if (pm_sensor_pa1 && pm_sensor_pa1 > -40) temps += (temps ? "&nbsp;&nbsp;" : "") + "P:&nbsp;" + pm_sensor_pa1 + "°C";
    if (wifi_chip_temp && wifi_chip_temp > -40) temps += (temps ? "&nbsp;&nbsp;" : "") + "W:&nbsp;" + wifi_chip_temp + "°C";
    if (temps) rows += '<tr><th>Temp</th><td>' + temps + '</td></tr>';

    if (tx_power != "" && is_lte && !is_5g_nsa) {
        rows += '<tr><th>TX Power</th><td>' + tx_power + ' dBm</td></tr>';
    }

    table.innerHTML = rows;
}

function setupInfoCheckboxes() {
    var netChk = document.getElementById("chk-network-info");
    var wanChk = document.getElementById("chk-wan-info");
    var devChk = document.getElementById("chk-device-info");
    var sigChk = document.getElementById("chk-signal-info");

    var netSection = document.getElementById("network-info-section");
    var wanSection = document.getElementById("wan-info-section");
    var devSection = document.getElementById("device-info-section");
    var sigSection = document.getElementById("signal-info-section");

    netChk.checked = localStorage.getItem("ScriptCheckBoxNetworkInfo") !== "false";
    wanChk.checked = localStorage.getItem("ScriptCheckBoxWanInfo") === "true";
    devChk.checked = localStorage.getItem("ScriptCheckBoxDeviceInfo") === "true";
    sigChk.checked = localStorage.getItem("ScriptCheckBoxSignalInfo") !== "false";

    netSection.style.display = netChk.checked ? "block" : "none";
    wanSection.style.display = wanChk.checked ? "block" : "none";
    devSection.style.display = devChk.checked ? "block" : "none";
    sigSection.style.display = sigChk.checked ? "block" : "none";

    netChk.addEventListener("change", function() { localStorage.setItem("ScriptCheckBoxNetworkInfo", netChk.checked); netSection.style.display = netChk.checked ? "block" : "none"; });
    wanChk.addEventListener("change", function() { localStorage.setItem("ScriptCheckBoxWanInfo", wanChk.checked); wanSection.style.display = wanChk.checked ? "block" : "none"; });
    devChk.addEventListener("change", function() { localStorage.setItem("ScriptCheckBoxDeviceInfo", devChk.checked); devSection.style.display = devChk.checked ? "block" : "none"; });
    sigChk.addEventListener("change", function() { localStorage.setItem("ScriptCheckBoxSignalInfo", sigChk.checked); sigSection.style.display = sigChk.checked ? "block" : "none"; });
}

/* ---- NG-style Panel Injection ---- */

function inject_html() {
    $(".headcontainer").hide();

    var old = document.getElementById("router-info-panel");
    if (old) old.remove();

    var panel = document.createElement("div");
    panel.id = "router-info-panel";
    panel.style.cssText = "width:100%;margin-bottom:20px;";

    panel.innerHTML = `
    <div id="router-info-box" class="info-box">
      <div class="info-title">
        <p class="headline">ZTE MC8020 Script v2025-05-20</p>
      </div>

      <div class="section">
        <div class="section-title">Network Mode</div>
        <div class="button-row">
          <button id="bearer-Only_5G">5G SA</button>
          <button id="bearer-LTE_AND_5G">5G NSA</button>
          <button id="bearer-WL_AND_5G">4G/5G</button>
          <button id="bearer-Only_LTE">4G</button>
        </div>
      </div>

      <div class="section">
        <div id="nr-band-lock-header" class="section-title">5G Band Lock</div>
        <div class="button-row">
          <button id="band-auto">All</button>
          <button id="band-manual">Manual</button>
          <button id="band-n1">N1</button>
          <button id="band-n3">N3</button>
          <button id="band-n7">N7</button>
          <button id="band-n28">N28</button>
          <button id="band-n28n75">N28+N75</button>
          <button id="band-n78">N78</button>
          <button id="band-n78n28n75">N78+N28+N75</button>
        </div>
      </div>

      <div class="section">
        <div id="lte-band-lock-header" class="section-title">4G Band Lock</div>
        <div class="button-row">
          <button id="lte-band-auto">All</button>
          <button id="lte-band-manual">Manual</button>
          <button id="lte-band-b1">B1</button>
          <button id="lte-band-b3">B3</button>
          <button id="lte-band-b7">B7</button>
          <button id="lte-band-b8">B8</button>
          <button id="lte-band-b20">B20</button>
          <button id="lte-band-b28">B28</button>
          <button id="lte-band-b1b3">B1+B3</button>
          <button id="lte-band-b1b3b7">B1+B3+B7</button>
        </div>
      </div>

      <div class="section celllock-container">
        <div class="celllock-box">
          <div class="section-title" id="title-5g-celllock">5G Cell Lock</div>
          <div class="button-row">
            <button id="btn-lock-5g-cell">Enable Cell Lock</button>
            <button id="btn-revert-5g-cell">Revert Cell Lock</button>
          </div>
        </div>
        <div class="celllock-box">
          <div class="section-title" id="title-4g-celllock">4G Cell Lock</div>
          <div class="button-row">
            <button id="btn-lock-4g-cell">Enable Cell Lock</button>
            <button id="btn-revert-4g-cell">Revert Cell Lock</button>
          </div>
        </div>
      </div>

      <div class="section" id="info-checkboxes">
        <div class="checkbox-group">
          <label><input type="checkbox" id="chk-network-info"> Show Network Info</label>
          <label><input type="checkbox" id="chk-signal-info"> Show Signal Info</label>
          <label><input type="checkbox" id="chk-wan-info"> Show WAN Info</label>
          <label><input type="checkbox" id="chk-device-info"> Show Device Info</label>
        </div>
      </div>

      <div class="info-section" id="network-info-section">
        <div class="section-title">Network Info</div>
        <table id="router-info-table" class="info-table"></table>
      </div>

      <div class="info-section" id="signal-info-section">
        <div class="section-title">Signal Info</div>
        <div id="signal-info-container"></div>
      </div>

      <div class="info-section" id="wan-info-section">
        <div class="section-title">WAN Info</div>
        <table id="wan-info-table" class="info-table"></table>
      </div>

      <div class="info-section" id="device-info-section">
        <div class="section-title">Device Info</div>
        <table id="system-info-table" class="info-table"></table>
      </div>

      <div class="section" id="more-section">
        <button id="btn-more">More Options</button>
        <div id="more-options" style="display:none;margin-top:16px;">
          <div class="option-section">
            <div class="section-title">General</div>
            <div class="button-row">
              <button id="btn-show-hidden">Show Hidden Settings</button>
              <button id="btn-auto-login">Enable Auto Login</button>
              <button id="btn-version">Version Info</button>
              <button id="btn-reboot">Reboot Router</button>
            </div>
          </div>
          <div class="option-section">
            <div class="section-title">Bridge Mode</div>
            <div class="button-row">
              <button id="btn-bridge-on">Enable Bridge</button>
              <button id="btn-bridge-off">Disable Bridge</button>
            </div>
          </div>
          <div class="option-section">
            <div class="section-title">Debug</div>
            <div class="button-row">
              <button id="btn-lte-band-info">LTE Band Info</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .info-title { font-weight:bold;font-size:18px;padding:8px 0;margin-bottom:12px;border-bottom:2px solid #ddd;text-align:center; }
      .info-box { background:#fff;border:1px solid #ccc;border-radius:8px;padding:15px;margin:0 auto;max-width:700px;box-shadow:0 2px 5px rgba(0,0,0,0.1); }
      .info-section { margin-top:16px;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,0.05);overflow:hidden; }
      .section { margin:16px 0; }
      .section-title { font-weight:bold;margin-bottom:8px;text-align:center;font-size:14px;color:#333; }
      .button-row { display:flex;flex-wrap:wrap;gap:6px;justify-content:center; }
      button { background:#f9f9f9;border:1px solid #ccc;border-radius:4px;padding:6px 12px;font-size:13px;cursor:pointer;transition:background 0.2s,color 0.2s; }
      button:hover { background:#4CAF50;color:#fff; }
      .celllock-container { display:flex;justify-content:space-between;gap:20px; }
      .celllock-box { flex:1;text-align:center;border:1px solid #eee;border-radius:6px;padding:10px;background:#fafafa; }
      .info-table { width:100%;border-collapse:collapse;margin-top:10px; }
      .info-table th,.info-table td { padding:6px;border-bottom:1px solid #eee; }
      .info-table th { text-align:left;font-weight:normal;color:#444; }
      .info-table td { text-align:right; }
      #info-checkboxes { margin-top:12px;display:flex;justify-content:center; }
      #info-checkboxes .checkbox-group { display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));justify-items:start;align-items:center;gap:8px 32px;width:max-content; }
      #info-checkboxes label { display:flex;align-items:center;gap:8px;margin:0;white-space:nowrap; }
      .cellid-sep { opacity:0.5; }
      .signal-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:10px; }
      .signal-cell { border:1px solid #eee;border-radius:6px;background:#fafafa;padding:8px; }
      .signal-cell table { width:100%;border-collapse:collapse; }
      .signal-cell th,.signal-cell td { padding:4px;border-bottom:1px solid #eee; }
      .signal-cell th { text-align:left;font-weight:normal;color:#444;width:50%; }
      .signal-cell td { text-align:right; }
      .signal-cell .cell-title { font-weight:bold;text-align:center;padding:4px 0;margin-bottom:6px;border-bottom:1px solid #ddd; }
      #more-section .option-section { background:#fafafa;border:1px solid #ddd;border-radius:6px;padding:12px;margin:16px auto;max-width:700px;box-shadow:0 1px 2px rgba(0,0,0,0.05); }
      #more-section .section-title { font-weight:bold;font-size:14px;margin-bottom:10px;color:#333;text-align:center;border:none; }
      #more-section .button-row { display:flex;flex-wrap:wrap;gap:8px;justify-content:center; }
      #more-section button { background:#f9f9f9;border:1px solid #ccc;border-radius:4px;padding:6px 12px;font-size:13px;cursor:pointer;transition:background 0.2s,color 0.2s; }
      #more-section button:hover { background:#4CAF50;color:#fff; }
      #btn-more { display:block;margin:0 auto 12px auto; }
    </style>`;

    document.body.prepend(panel);

    // Bearer buttons
    document.getElementById("bearer-Only_5G").addEventListener("click", function() { set_net_mode("Only_5G"); showUiFeedback(true); });
    document.getElementById("bearer-LTE_AND_5G").addEventListener("click", function() { set_net_mode("LTE_AND_5G"); showUiFeedback(true); });
    document.getElementById("bearer-WL_AND_5G").addEventListener("click", function() { set_net_mode("WL_AND_5G"); showUiFeedback(true); });
    document.getElementById("bearer-Only_LTE").addEventListener("click", function() { set_net_mode("Only_LTE"); showUiFeedback(true); });

    // 4G Band buttons
    var SUPPORTED_4G_BANDS = [1, 3, 7, 8, 20, 28];
    function build4gMask(bands) { return bands.reduce(function(mask, b) { return mask | get4gBandMask(Number(b)); }, 0n); }
    function setup4gBtn(btnId, bands, isAll, isManual) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener("click", function() {
            var bandsArr = bands || [];
            if (isAll) bandsArr = SUPPORTED_4G_BANDS;
            if (isManual) {
                while (true) {
                    var input = prompt("Enter 4G bands (e.g. 1+3+20 or 1,3,20):");
                    if (input === null) return;
                    var tokens = input.split(/[\+,]/).map(function(t){return t.trim();}).filter(function(t){return t !== "";});
                    if (tokens.length > 0 && tokens.every(function(t){return /^\d+$/.test(t);})) {
                        bandsArr = tokens;
                        break;
                    }
                    alert("Invalid input. Enter band numbers like: 1+3+20");
                }
            }
            var mask = build4gMask(bandsArr);
            if (!isAll) {
                alert("WARNING: After band lock, you must FULLY POWER CYCLE the router (unplug, wait, plug back in).\n\nA soft reboot is NOT sufficient.\n\nBefore cell locking, make sure band lock is set to AUTO or includes the target cell's band.");
            }
            update4gBandLockHeader(mask);
            lte_band_selection(bandsArr.map(String).join("+"));
            showUiFeedback(true);
        });
    }
    setup4gBtn("lte-band-auto", null, true, false);
    setup4gBtn("lte-band-manual", null, false, true);
    SUPPORTED_4G_BANDS.forEach(function(b) { setup4gBtn("lte-band-b" + b, [b], false, false); });
    setup4gBtn("lte-band-b1b3", ["1","3"], false, false);
    setup4gBtn("lte-band-b1b3b7", ["1","3","7"], false, false);

    // 5G Band buttons
    var FULL_5G_BANDS = ["1","3","7","8","20","28","38","40","41","75","77","78"];
    function setup5gBtn(btnId, bands, isAll, isManual) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener("click", function() {
            var bandsArr = bands ? [].concat(bands) : [];
            if (isAll) bandsArr = FULL_5G_BANDS.slice();
            if (isManual) {
                while (true) {
                    var input = prompt("Enter 5G bands (e.g. 1+3+28 or 1,3,28):");
                    if (input === null) return;
                    var tokens = input.split(/[\+,]/).map(function(t){return t.trim();}).filter(function(t){return t !== "";});
                    if (tokens.length > 0 && tokens.every(function(t){return /^\d+$/.test(t);})) {
                        bandsArr = tokens;
                        break;
                    }
                    alert("Invalid input. Enter band numbers like: 1+3+28");
                }
            }
            if (!isAll) {
                alert("WARNING: After band lock, you must FULLY POWER CYCLE the router (unplug, wait, plug back in).\n\nA soft reboot is NOT sufficient.\n\nBefore cell locking, make sure band lock is set to AUTO or includes the target cell's band.");
            }
            update5gBandLockHeader(bandsArr);
            nr_band_selection(bandsArr.join(","));
            showUiFeedback(true);
        });
    }
    setup5gBtn("band-auto", null, true, false);
    setup5gBtn("band-manual", null, false, true);
    setup5gBtn("band-n1", "1", false, false);
    setup5gBtn("band-n3", "3", false, false);
    setup5gBtn("band-n7", "7", false, false);
    setup5gBtn("band-n28", "28", false, false);
    setup5gBtn("band-n78", "78", false, false);
    setup5gBtn("band-n28n75", ["28","75"], false, false);
    setup5gBtn("band-n78n28n75", ["78","28","75"], false, false);

    // 5G Cell Lock buttons
    document.getElementById("btn-lock-5g-cell").addEventListener("click", function(e) {
        var pci = e.target.dataset.pci || "<PCI>";
        var earfcn = e.target.dataset.earfcn || "<EARFCN>";
        var band = e.target.dataset.band || "<BAND>";
        var nrCells = parse_nr_cell_info();
        if (nrCells.length > 0) {
            pci = nrCells[0].pci;
            earfcn = nrCells[0].arfcn;
            band = nrCells[0].band.replace("n","");
        }
        nr_cell_lock(false, pci + "," + earfcn + "," + band + ",30");
    });
    document.getElementById("btn-revert-5g-cell").addEventListener("click", function() {
        nr_cell_lock(true);
    });

    // 4G Cell Lock buttons
    document.getElementById("btn-lock-4g-cell").addEventListener("click", function(e) {
        var pci = e.target.dataset.pci || "<PCI>";
        var earfcn = e.target.dataset.earfcn || "<EARFCN>";
        lte_cell_lock(false, pci + "," + earfcn);
    });
    document.getElementById("btn-revert-4g-cell").addEventListener("click", function() {
        lte_cell_lock(true);
    });

    // More options
    document.getElementById("btn-more").addEventListener("click", function() {
        document.getElementById("btn-more").style.display = "none";
        document.getElementById("more-options").style.display = "block";
    });
    document.getElementById("btn-show-hidden").addEventListener("click", function() { make_hidden_settings_visible(); });
    document.getElementById("btn-auto-login").addEventListener("click", function() { enable_automatic_login(); });
    document.getElementById("btn-version").addEventListener("click", function() { version_info(); });
    document.getElementById("btn-reboot").addEventListener("click", function() { reboot(); });
    document.getElementById("btn-bridge-on").addEventListener("click", function() { bridge_mode(true); });
    document.getElementById("btn-bridge-off").addEventListener("click", function() { bridge_mode(false); });
    document.getElementById("btn-lte-band-info").addEventListener("click", function() { get_lte_band_info(); });

    // Button blur handler
    initButtonBlurHandler();

    // Info checkboxes
    setupInfoCheckboxes();
}

prepare_1_timer_id = window.setInterval(prepare_1, 250);
prepare_1();

$("#change").prop("disabled", !1);