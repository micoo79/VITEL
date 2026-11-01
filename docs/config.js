/* VITEL – helyi beállítások.
 *
 * Aláírás másik eszközön (QR):
 *   Állítsd be a saját tárhelyeden futó relay URL-jét. Ez az az egyetlen
 *   végpont, ahová a telefon feltölti, és ahonnan a gép lekéri az aláírást.
 *   A relay forráskódja: docs/relay/sign-relay.php
 *
 *   Példa:  window.VITEL_SIGN_RELAY = "https://sajat-domain.hu/vitel/sign-relay.php";
 *
 *   Ha üresen hagyod, a QR-es (másik eszközös) aláírás nem érhető el,
 *   az azonos eszközön történő (érintős/egeres) aláírás viszont működik.
 */
window.VITEL_SIGN_RELAY = "";
