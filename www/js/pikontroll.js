// pause
let pkt_paused = false;
$('#pkt-pause-tracking').click(function() {
    if (pkt_paused) {
        pikontroll("resume");
        pkt_paused = false;
        $('#pkt-pause-tracking').text("Pause tracking");
    } else {
        pikontroll("pause");
        pkt_paused = true;
        $('#pkt-pause-tracking').text("Resume tracking");
    }
});

// coords
let pkt_coords_in_flight = false;
window.setInterval(function() {
    if (!pkt_coords_in_flight) {
        pkt_coords_in_flight = true;
        pikontroll("coords", function(data, status, xhr) {
            let match = /ok: coords (-?\d*\.?\d+) (-?\d*\.?\d+)/.exec(data);
            let alt = match[1];
            let az = match[2];
            $('#pkt-coords').html("(" + (Math.round(alt*1000)/1000) + ",<br>" + (Math.round(az*1000)/1000) + ")");
            pkt_coords_in_flight = false;
        });
    }
}, 1000);


// trim
let pkt_trim_in_flight = [false, false];
let pkt_extra_trim = [false, false];
let pkt_trim = [0, 0];
let pkt_tare = [0, 0];
$('#pkt-up').click(function() {
    pkt_add_trim(1, 1);
});
$('#pkt-down').click(function() {
    pkt_add_trim(1, -1);
});
$('#pkt-left').click(function() {
    pkt_add_trim(0, -1);
});
$('#pkt-right').click(function() {
    pkt_add_trim(0, 1);
});
$('#pkt-0-zero').click(function() {
    pkt_tare[0] = -pkt_trim[0];
    pkt_add_trim(0, 0);
});
$('#pkt-1-zero').click(function() {
    pkt_tare[1] = -pkt_trim[1];
    pkt_add_trim(1, 0);
});

function pkt_add_trim(motor, dir) {
    // if there's already a trim request in-flight, just note that
    // we want to send another once it's done and do nothing else yet
    pkt_trim[motor] += parseInt($('#pkt-trim-steps').val()) * dir;
    $('#pkt-' + motor + '-trim').text((pkt_trim[motor] + pkt_tare[motor]) + "...");

    if (pkt_trim_in_flight[motor]) {
        pkt_extra_trim[motor] = true;
    } else {
        pkt_trim_in_flight[motor] = true;
        pikontroll("trim " + motor + " " + pkt_trim[motor], pkt_trim_cb);
    }
}

pikontroll("trim 0", pkt_trim_cb);
pikontroll("trim 1", pkt_trim_cb);

function pkt_trim_cb(data, status, xhr) {
    // ok: trim 0 -50000
    let match = /ok: trim (\d+) (-?\d+)/.exec(data);
    let motor = parseInt(match[1]);
    let trim = parseInt(match[2]);

    pkt_trim_in_flight[motor] = false;

    if (pkt_extra_trim[motor]) {
        pkt_trim_in_flight[motor] = true;
        pikontroll("trim " + motor + " " + pkt_trim[motor], pkt_trim_cb);
        pkt_extra_trim[motor] = false;
    } else {
        pkt_trim[motor] = trim;
        $('#pkt-' + motor + '-trim').text(trim + pkt_tare[motor]);
    }
}

// focus
let pkt_focus_in_flight = false;
let pkt_extra_focus_calls = false;
$('#pkt-focus').change(function() {
    // if there's already a focus request in-flight, just note that
    // we want to send another once it's done and do nothing else yet
    if (pkt_focus_in_flight)
        pkt_extra_focus_calls = true;
    else
        pkt_set_focus($('#pkt-focus').val());
});

pikontroll("focus", pkt_focus_cb);

// receive
$('#pkt-receive').click(function() {
    pikontroll("receive");
});

function pkt_set_focus(val) {
    pkt_focus_in_flight = true;
    pikontroll("focus " + val, pkt_focus_cb);
}

function pkt_focus_cb(data, status, xhr) {
    // ok: focus 1500 in 525 to 2300
    let match = /ok: focus (\d+) in (\d+) to (\d+)/.exec(data);
    let focus = parseInt(match[1]);
    let focusmin = parseInt(match[2]);
    let focusmax = parseInt(match[3]);

    // focus request no longer in-flight
    pkt_focus_in_flight = false;
    // if there were extra focus changes, send a new request
    if (pkt_extra_focus_calls) {
        pkt_extra_focus_calls = false;
        pkt_set_focus($('#pkt-focus').val());
    } else {
        // update slider position only in the event that there's been
        // no new position input
        $('#pkt-focus').attr('min', focusmin);
        $('#pkt-focus').attr('max', focusmax);
        $('#pkt-focus').val(focus);
    }
}

// generic
function pikontroll(cmd, cb) {
    $.ajax("pikontroll.php?cmd=" + encodeURIComponent(cmd), {
        success: cb,
        error: function() {
            alert("Error calling pikontroll (is pikontrolld running?)");
        },
        timeout: function() {
            alert("Timeout calling pikontroll");
        },
    });
}

// image processing:
let processing_image = false;

function check_image_processing() {
    let min_enabled = $('#proc-enable-min').is(':checked');
    let max_enabled = $('#proc-enable-max').is(':checked');
    let grey_enabled = $('#proc-enable-grey').is(':checked');
    let antivig_enabled = $('#proc-anti-vignette').is(':checked');

    processing_image = (need_autostretch || min_enabled || max_enabled || grey_enabled || antivig_enabled);
    if (processing_image) {
        $('#mjpeg_dest').hide();
        $('#processed_img').show();
    } else {
        $('#mjpeg_dest').show();
        $('#processed_img').hide();
    }
}

$('#mjpeg_dest').on('load', process_image);

var antivig_k = 0.5;
var antivig_c = 2;
let need_autostretch = false;

function process_image() {
    check_image_processing();
    if (!processing_image)
        return;

    let starttime = Date.now();

    // load image data via canvas
    let canvas = document.createElement("canvas");
    let im = document.getElementById('mjpeg_dest');
    canvas.width = im.width;
    canvas.height = im.height;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(im,0,0);
    var data = ctx.getImageData(0, 0, im.width, im.height);

    // load settings
    let pixmin = parseInt($('#proc-min').val());
    let pixmax = parseInt($('#proc-max').val());
    let min_enabled = $('#proc-enable-min').is(':checked');
    let max_enabled = $('#proc-enable-max').is(':checked');
    if (!min_enabled) pixmin = 0;
    if (!max_enabled) pixmax = 255;
    if (pixmin < 0) pixmin = 0;
    if (pixmin > 255) pixmin = 255;
    if (pixmax < 0) pixmax = 0;
    if (pixmax > 255) pixmax = 255;
    if (pixmin > pixmax) pixmin = pixmax;
    let grey_enabled = $('#proc-enable-grey').is(':checked');
    let greymode = $('#proc-greyscale').val();
    let antivig_enabled = $('#proc-anti-vignette').is(':checked');

    let allvals = [];

    // this function applies our processing steps to a given brightness value at a given x,y coordinate
    let process_pixel = function(x, y, col) {
        if (antivig_enabled) {
            let dx = 0.5 - (x / im.width);
            let dy = (y-im.height/2)/(im.width);
            let rsqr = dx*dx+dy*dy;
            col = col * antivig_k * (-rsqr + antivig_c);

            if (col < 0) col = 0;
            if (col > 255) col = 255;
            col = col;
        }

        // TODO: if dark subtraction enabled, subtract dark pixels now

        if (need_autostretch)
            allvals.push(col);

        col = (col-pixmin) * 255/(pixmax-pixmin);
        if (col < 0) col = 0;
        if (col > 255) col = 255;
        return col;
    };

    // modify image data
    pix = data.data;
    for (let y = 0; y < im.height; y++) {
        for (let x = 0; x < im.width; x++) {
            if (grey_enabled) {
                // greyscale mode: apply grey scale filter and then process just one channel
                let v = 0;
                let idx = 4 * (y*im.width + x);
                switch(greymode) {
                    case 'R': v = pix[idx+0]; break;
                    case 'G': v = pix[idx+1]; break;
                    case 'B': v = pix[idx+2]; break;
                    case 'Mean': v = (pix[idx+0]+pix[idx+1]+pix[idx+2])/3; break;
                }

                v = process_pixel(x, y, v);

                // write all 3 channels
                pix[idx++] = v;
                pix[idx++] = v;
                pix[idx] = v;
            } else {
                // colour mode: process each channel individually
                for (let c = 0; c < 3; c++) {
                    let idx = 4 * (y*im.width + x) + c;
                    pix[idx] = process_pixel(x, y, pix[idx]);
                }
            }
        }
    }

    if (need_autostretch) {
        allvals.sort(function(a,b) { return parseInt(a) > parseInt(b); });
        let pixmin = Math.round(allvals[Math.round(allvals.length * 0.01)]);
        let pixmax = Math.round(allvals[Math.round(allvals.length * 0.99)]);
        $('#proc-min').val(pixmin);
        $('#proc-enable-min').prop('checked',true);
        $('#proc-max').val(pixmax);
        $('#proc-enable-max').prop('checked',true);
        need_autostretch = false;
        // HACK: now we have our auto-stretch parameters, let's run this function again to do the processing
        process_image();
    } else {
        // restore image data via canvas
        ctx.putImageData(data, 0, 0);
        $('#processed_img').attr('src', canvas.toDataURL("image/png"));

        let timetaken = Date.now() - starttime;
        $('#proc-time').text(timetaken + " ms");
    }
}

$('#autostretch').click(function() {
    need_autostretch = true;
});
