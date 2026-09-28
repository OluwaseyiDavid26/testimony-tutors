import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    // 1. Confirm the caller is actually staff/admin (not just any logged-in user)
    const { data: callerStaff, error: callerErr } = await supabaseAdmin
      .from("staff_accounts")
      .select("id, role")
      .eq("auth_user_id", userClaims.id)
      .single();

    if (callerErr || !callerStaff) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    // Server decides this — never trust the client for approval status
    const autoApprovalStatus = callerStaff.role === "admin" ? "approved" : "pending";

    const body = await req.json();

    const {
      firstName, lastName, dob, gender, phone, address, branch,
      department, classSession, examTypes, subjects, regDate, amountPaid,
      paymentDate, guardianName, guardianPhone, eligible, addedBy , photo
    } = body;

    if (!firstName || !lastName) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Generate the next reg no from the real student count (same scheme as before: TT + 27000 + n)
    const { count, error: countErr } = await supabaseAdmin
      .from("students")
      .select("id", { count: "exact", head: true });

    if (countErr) {
      return Response.json({ error: "Could not generate registration number." }, { status: 400 });
    }

    const password = lastName.toLowerCase().padEnd(6, "0");
    const baseNo = 27000 + (count ?? 0) + 1;

    // 2. Create the Auth user (admin-only privileged action).
    // A reg no can collide with one that was already used and then freed up
    // (e.g. a student was deleted from the table but their Auth login was
    // never removed) — in that case createUser fails with "already
    // registered" even though nothing is actually wrong with this
    // registration. Retry with the next reg no instead of failing outright.
    let regNo, email, newUser, createErr;
    const MAX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      regNo = "TT" + (baseNo + attempt);
      email = `${regNo.toLowerCase()}@student.testimonytutorportal.app`;

      const result = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      newUser = result.data;
      createErr = result.error;

      if (!createErr) break;

      const msg = (createErr.message || "").toLowerCase();
      const isDuplicate =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists");
      if (!isDuplicate) break; // a different kind of failure — don't keep looping
    }

    if (createErr || !newUser?.user) {
      return Response.json({ error: createErr?.message || "Failed to create login." }, { status: 400 });
    }

    // 3. Insert the student row, linked to the new Auth user
    const { data: studentRow, error: insertErr } = await supabaseAdmin
      .from("students")
      .insert({
        photo_url: photo || null,
        auth_user_id: newUser.user.id,
        reg_no: regNo,
        first_name: firstName,
        last_name: lastName,
        dob: dob || null,
        gender: gender || null,
        phone: phone || null,
        address: address || null,
        branch: branch || null,
        department: department || null,
        class_session: classSession || null,
        exam_types: examTypes || [],
        subjects: subjects || [],
        reg_date: regDate || new Date().toISOString().slice(0, 10),
        amount_paid: amountPaid || 0,
        payment_date: paymentDate || null,
        guardian_name: guardianName || null,
        guardian_phone: guardianPhone || null,
        eligible: eligible ?? false,
        approval_status: autoApprovalStatus,
        added_by: addedBy || callerStaff.id
      })
      .select()
      .single();

    if (insertErr) {
      // Roll back the auth user if the student row failed, so we don't leave an orphaned login
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return Response.json({ error: insertErr.message }, { status: 400 });
    }

    return Response.json({ student: studentRow, password });
  })
};